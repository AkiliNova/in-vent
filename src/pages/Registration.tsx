import { useState } from 'react';
import {
  User,
  Mail,
  Phone,
  Building,
  UtensilsCrossed,
  Check,
  QrCode,
  Wallet,
  ArrowRight
} from 'lucide-react';
import { QRCodeSVG } from "qrcode.react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import Navigation from '@/components/Navigation';

// Firestore
import { db } from '@/firebase/firebase';
import {

  collection,
  addDoc,
  serverTimestamp,
  query,

  where,
  getDocs,
  updateDoc
} from 'firebase/firestore';

const Registration = () => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    guestCategory: '',
    companyOrIndividual: '',
    dietaryRestrictions: '',
    agreeTerms: false,
    agreeMarketing: false,
    guestId: ''
  });
  const QR_PIXEL_SIZE = 184;
  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Step validation
  const isStep1Valid =
    formData.firstName &&
    formData.lastName &&
    formData.email &&
    formData.phone &&
    formData.guestCategory &&
    formData.companyOrIndividual;

  const isStep2Valid = formData.agreeTerms;

  const handleSubmit = async () => {
    if (!isStep2Valid) return;

    setIsSubmitting(true);

    try {
      // 🔍 Check if email already exists
      const guestsRef = collection(db, "guests");
      const emailQuery = query(guestsRef, where("email", "==", formData.email));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        toast({
          title: "Email Already Registered",
          description: "This email is already registered for the event.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // 🔥 Save guest to Firestore
      const docRef = await addDoc(guestsRef, {
        ...formData,
        dietaryRestrictions: formData.dietaryRestrictions || null,
        createdAt: serverTimestamp(),
      });
      setFormData(prev => ({ ...prev, guestId: docRef.id }));

      // 🔑 Save ticketId inside the document
      await updateDoc(docRef, { ticketId: docRef.id });

      // Store ticket for QR Step
      setTicketId(docRef.id);

      toast({
        title: "Registration Complete!",
        description: "Your QR pass has been generated.",
      });

      setStep(3);
    } catch (error: any) {
      console.error("Firestore Error:", error);
      toast({
        title: "Registration Failed",
        description: error.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-2xl">

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mb-12">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                    }`}
                >
                  {step > s ? <Check className="w-5 h-5" /> : s}
                </div>

                {s < 3 && (
                  <div
                    className={`w-16 h-1 rounded-full transition-all ${step > s ? "bg-primary" : "bg-secondary"
                      }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="glass rounded-3xl p-8 animate-slide-up">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  Register for Event
                </h1>
                <p className="text-muted-foreground">
                  Fill in your details to receive your QR pass
                </p>
              </div>

              <div className="space-y-6">
                {/* Names */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="w-4 h-4" /> First Name
                    </Label>
                    <Input
                      className="h-12"
                      value={formData.firstName}
                      onChange={(e) =>
                        handleInputChange("firstName", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      className="h-12"
                      value={formData.lastName}
                      onChange={(e) =>
                        handleInputChange("lastName", e.target.value)
                      }
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email Address
                  </Label>
                  <Input
                    type="email"
                    className="h-12"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Phone className="w-4 h-4" /> Phone Number
                  </Label>
                  <Input
                    className="h-12"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                  />
                </div>

                {/* Category + Company */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Guest Category</Label>
                    <Select
                      onValueChange={(value) =>
                        handleInputChange("guestCategory", value)
                      }
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIP">VIP</SelectItem>
                        <SelectItem value="Guest">Guest</SelectItem>
                        <SelectItem value="Speaker">Speaker</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Company / Individual</Label>
                    <Input
                      className="h-12"
                      value={formData.companyOrIndividual}
                      onChange={(e) =>
                        handleInputChange("companyOrIndividual", e.target.value)
                      }
                    />
                  </div>
                </div>

                <Button
                  variant="hero"
                  size="xl"
                  className="w-full"
                  disabled={!isStep1Valid}
                  onClick={() => setStep(2)}
                >
                  Continue <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="glass rounded-3xl p-8 animate-slide-up">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">Almost There!</h1>
                <p className="text-muted-foreground">
                  Just a few more details
                </p>
              </div>

              <div className="space-y-6">
                {/* Dietary */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <UtensilsCrossed className="w-4 h-4" /> Dietary Needs
                  </Label>
                  <Input
                    value={formData.dietaryRestrictions}
                    onChange={(e) =>
                      handleInputChange("dietaryRestrictions", e.target.value)
                    }
                    className="h-12"
                  />
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={formData.agreeTerms}
                      onCheckedChange={(checked) =>
                        handleInputChange("agreeTerms", checked as boolean)
                      }
                    />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      I agree to the{" "}
                      <a className="text-primary hover:underline">Terms</a> and{" "}
                      <a className="text-primary hover:underline">Privacy</a>
                    </p>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={formData.agreeMarketing}
                      onCheckedChange={(checked) =>
                        handleInputChange("agreeMarketing", checked as boolean)
                      }
                    />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      I’d like to receive updates about future events.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline" size="xl" onClick={() => setStep(1)}>
                    Back
                  </Button>

                  <Button
                    variant="hero"
                    size="xl"
                    disabled={!isStep2Valid || isSubmitting}
                    onClick={handleSubmit}
                    className="flex-1"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary-foreground 
                          border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Get My QR Pass
                        <QrCode className="w-5 h-5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
  <div className="glass rounded-3xl p-8 text-center animate-scale-in">
    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-success/20 flex items-center justify-center">
      <Check className="w-10 h-10 text-success" />
    </div>

    <h1 className="text-3xl font-bold mb-2">You're All Set!</h1>
    <p className="text-muted-foreground mb-8">
      Your QR pass is ready. Show this at the door.
    </p>

    {/* QR Code */}
    <div className="relative w-64 h-64 mx-auto mb-8">
      <div className="absolute inset-0 bg-primary/10 rounded-3xl blur-xl" />
      <div className="relative w-full h-full rounded-3xl bg-card border-2 border-primary/30 p-6 flex items-center justify-center">
        <div className="rounded-xl overflow-hidden bg-white p-3 shadow-inner">
          <QRCodeSVG
            value={`ticket:${formData.guestId ?? ''}`}
            size={184}
            level="H"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#000000"
            style={{ display: "block" }}
          />
        </div>
      </div>
    </div>

    {/* Guest Info */}
    <div className="space-y-3 mb-8">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium">
          {formData.firstName} {formData.lastName}
        </span>
      </p>

      <p className="text-xs text-muted-foreground font-mono">
        {ticketId ? `TICKET-${ticketId}` : "TICKET-GENERATED"}
      </p>
    </div>

    {/* Action Buttons */}
    <div className="flex flex-col sm:flex-row gap-3">
      <Button variant="hero" size="lg" className="flex-1">
        <Wallet className="w-5 h-5" />
        Add to Wallet
      </Button>
      <Button variant="heroOutline" size="lg" className="flex-1">
        <Mail className="w-5 h-5" />
        Email QR Code
      </Button>
    </div>

    {/* New Button */}
    <Button
      variant="outline"
      size="lg"
      className="mt-6 w-full"
      onClick={() => {
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          guestCategory: '',
          companyOrIndividual: '',
          dietaryRestrictions: '',
          agreeTerms: false,
          agreeMarketing: false,
          guestId: ''
        });
        setTicketId(null);
        setStep(1);
      }}
    >
      Register Someone Else
    </Button>

    <p className="text-xs text-muted-foreground mt-6">
      A confirmation email has been sent to {formData.email}
    </p>
  </div>
)}

        </div>
      </main>
    </div>
  );
};

export default Registration;
