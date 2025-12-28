"use client";

import { useState, useEffect } from "react";
import {
  User,
  Mail,
  Phone,
  UtensilsCrossed,
  Check,
  QrCode,
  Wallet,
  ArrowRight
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { db } from "@/firebase/firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

// -----------------------------
// Types
// -----------------------------
interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  guestCategory: string;
  companyOrIndividual: string;
  dietaryRestrictions: string;
  agreeTerms: boolean;
  agreeMarketing: boolean;
  guestId: string;
  status: "pending" | "checked-in" | "flagged";
  checkedInAt?: string;
  amountPaid: number;
  customFields: Record<string, any>;
}

interface AppSettings {
  dietaryOptions: string[];
}
type DynamicFieldType =
  | "text"
  | "number"
  | "email"
  | "select"
  | "checkbox"
  | "textarea";

interface DynamicField {
  id: string;
  label: string;
  type: DynamicFieldType;
  required?: boolean;
  step: 1 | 2;
  order?: number;
  placeholder?: string;
  options?: string[];
  enabled?: boolean;
}


// -----------------------------
// Registration Component
// -----------------------------
const Registration = () => {
  const { tenantId } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    guestCategory: '',
    companyOrIndividual: '',
    dietaryRestrictions: 'None',
    agreeTerms: false,
    agreeMarketing: false,
    guestId: '',
    status: "pending",
    amountPaid: 0,
    customFields: {},
  });

  const [settings, setSettings] = useState<AppSettings>({
    dietaryOptions: ["None", "Vegetarian", "Vegan", "Gluten-Free", "Halal", "Kosher"]
  });

  // -----------------------------
  // Load tenant-scoped settings
  // -----------------------------
  useEffect(() => {
    const fetchSettings = async () => {
      if (!tenantId) return;
      try {
        const docRef = doc(db, `tenants/${tenantId}/app_settings`, "settings");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as AppSettings;
          if (data.dietaryOptions?.length) {
            setSettings({ dietaryOptions: data.dietaryOptions });
            if (!data.dietaryOptions.includes(formData.dietaryRestrictions)) {
              setFormData(prev => ({ ...prev, dietaryRestrictions: data.dietaryOptions[0] }));
            }
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    fetchSettings();
  }, [tenantId]);
  const [dynamicFields, setDynamicFields] = useState<DynamicField[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const loadDynamicFields = async () => {
      const snap = await getDocs(
        collection(db, `tenants/${tenantId}/registration_fields`)
      );

      const fields = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as DynamicField))
        .filter(f => f.enabled !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      setDynamicFields(fields);

      // initialize values
      const values: Record<string, any> = {};
      fields.forEach(f => {
        values[f.id] = f.type === "checkbox" ? false : "";
      });

      setFormData(prev => ({
        ...prev,
        customFields: {
          ...values,
          ...prev.customFields,
        },
      }));

    };

    loadDynamicFields();
  }, [tenantId]);

  const handleInputChange = (field: string, value: string | boolean | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  const dynamicFieldsValid = (step: 1 | 2) =>
    dynamicFields
      .filter(f => f.required && f.step === step)
      .every(f => Boolean(formData.customFields[f.id]));

  const isStep1Valid =
    formData.firstName &&
    formData.lastName &&
    formData.email &&
    formData.phone &&
    formData.guestCategory &&
    formData.companyOrIndividual
    && dynamicFieldsValid(1);

  const isStep2Valid =
    formData.agreeTerms && formData.amountPaid >= 0 && dynamicFieldsValid(2);


  // -----------------------------
  // Submit Registration
  // -----------------------------
  const handleSubmit = async () => {
    if (!tenantId) {
      toast({
        title: "Tenant Not Found",
        description: "You cannot register without a tenant.",
        variant: "destructive"
      });
      return;
    }

    if (!isStep2Valid) return;

    setIsSubmitting(true);
    try {
      const guestsRef = collection(db, `tenants/${tenantId}/guests`);

      // Check for duplicate email
      const emailQuery = query(guestsRef, where("email", "==", formData.email));
      const emailSnapshot = await getDocs(emailQuery);
      if (!emailSnapshot.empty) {
        toast({
          title: "Email Already Registered",
          description: "This email is already registered for this tenant.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Prepare guest data safely
      const guestData: any = {
        ...formData,
        createdAt: serverTimestamp(),
        registeredAt: new Date().toISOString(),
      };
      if (formData.status === 'checked-in') {
        guestData.checkedInAt = new Date().toISOString();
      }

      // Add guest
      const docRef = await addDoc(guestsRef, guestData);

      // Update guestId
      await updateDoc(docRef, { guestId: docRef.id });
      setFormData(prev => ({ ...prev, guestId: docRef.id }));
      setTicketId(docRef.id);

      toast({ title: "Registration Complete!", description: "Your QR pass has been generated." });
      setStep(3);

    } catch (error: any) {
      console.error(error);
      toast({ title: "Registration Failed", description: error.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  const renderDynamicField = (field: DynamicField) => {
    const value = formData.customFields[field.id];

    const update = (val: any) =>
      setFormData(p => ({
        ...p,
        customFields: { ...p.customFields, [field.id]: val }
      }));

    switch (field.type) {
      case "text":
      case "email":
      case "number":
        return (
          <Input
            type={field.type}
            placeholder={field.placeholder}
            value={value}
            onChange={e => update(e.target.value)}
          />
        );

      case "textarea":
        return (
          <textarea
            className="w-full rounded-md border p-3"
            placeholder={field.placeholder}
            value={value}
            onChange={e => update(e.target.value)}
          />
        );

      case "select":
        return (
          <Select value={value} onValueChange={update}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(opt => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "checkbox":
        return (
          <Checkbox checked={value} onCheckedChange={update} />
        );
    }
  };


  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-2xl">

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mb-12">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${step >= s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  {step > s ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < 3 && <div className={`w-16 h-1 rounded-full transition-all ${step > s ? "bg-primary" : "bg-secondary"}`} />}
              </div>
            ))}
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="glass rounded-3xl p-8 animate-slide-up">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2"><User className="w-4 h-4" /> First Name</Label>
                  <Input className="h-12" value={formData.firstName} onChange={e => handleInputChange("firstName", e.target.value)} />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input className="h-12" value={formData.lastName} onChange={e => handleInputChange("lastName", e.target.value)} />
                </div>
              </div>

              <div className="mt-4">
                <Label className="flex items-center gap-2"><Mail className="w-4 h-4" /> Email</Label>
                <Input type="email" className="h-12" value={formData.email} onChange={e => handleInputChange("email", e.target.value)} />
              </div>
              <div className="mt-4">
                <Label className="flex items-center gap-2"><Phone className="w-4 h-4" /> Phone</Label>
                <Input className="h-12" value={formData.phone} onChange={e => handleInputChange("phone", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Guest Category</Label>
                  <Select onValueChange={value => handleInputChange("guestCategory", value)}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIP">VIP</SelectItem>
                      <SelectItem value="Guest">Guest</SelectItem>
                      <SelectItem value="Speaker">Speaker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Company / Individual</Label>
                  <Input className="h-12" value={formData.companyOrIndividual} onChange={e => handleInputChange("companyOrIndividual", e.target.value)} />
                </div>
              </div>
              {dynamicFields
                .filter(f => f.step === 1)
                .map(field => (
                  <div key={field.id} className="mt-4">
                    <Label>
                      {field.label}
                      {field.required && " *"}
                    </Label>
                    {renderDynamicField(field)}
                  </div>
                ))}


              <Button variant="hero" size="xl" className="w-full mt-6" disabled={!isStep1Valid} onClick={() => setStep(2)}>
                Continue <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="glass rounded-3xl p-8 animate-slide-up">
              <Label className="flex items-center gap-2"><UtensilsCrossed className="w-4 h-4" /> Dietary Needs</Label>
              <Select
                value={formData.dietaryRestrictions}
                onValueChange={val => setFormData(prev => ({ ...prev, dietaryRestrictions: val }))}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Select Dietary Preference" /></SelectTrigger>
                <SelectContent>
                  {settings.dietaryOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="mt-4">
                <Label className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Amount Paid
                </Label>
                <Input
                  type="number"
                  min="0"
                  className="h-12"
                  value={formData.amountPaid}
                  onChange={e =>
                    handleInputChange("amountPaid", Number(e.target.value))
                  }
                  placeholder="Enter amount paid"
                />
              </div>


              <div className="mt-4">
                <Label>Status</Label>
                <div className="flex gap-4 mt-2">
                  {['pending', 'checked-in', 'flagged'].map(s => (
                    <label key={s} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="status"
                        value={s}
                        checked={formData.status === s}
                        onChange={() => setFormData(prev => ({
                          ...prev,
                          status: s as "pending" | "checked-in" | "flagged",
                          checkedInAt: s === 'checked-in' ? new Date().toISOString() : undefined
                        }))}
                      />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              {dynamicFields
                .filter(f => f.step === 2)
                .map(field => (
                  <div key={field.id} className="mt-4">
                    <Label>
                      {field.label}
                      {field.required && " *"}
                    </Label>
                    {renderDynamicField(field)}
                  </div>
                ))}


              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-start space-x-3">
                  <Checkbox checked={formData.agreeTerms} onCheckedChange={checked => handleInputChange("agreeTerms", checked as boolean)} />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    I agree to the <a className="text-primary hover:underline">Terms</a> and <a className="text-primary hover:underline">Privacy</a>
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <Checkbox checked={formData.agreeMarketing} onCheckedChange={checked => handleInputChange("agreeMarketing", checked as boolean)} />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    I’d like to receive updates about future events.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 mt-4">
                <Button variant="outline" size="xl" onClick={() => setStep(1)}>Back</Button>
                <Button variant="hero" size="xl" disabled={!isStep2Valid || isSubmitting} onClick={handleSubmit} className="flex-1">
                  {isSubmitting ? "Processing..." : <>Get My QR Pass <QrCode className="w-5 h-5" /></>}
                </Button>
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
              <p className="text-muted-foreground mb-8">Your QR pass is ready. Show this at the door.</p>

              <div className="relative w-64 h-64 mx-auto mb-8">
                <QRCodeSVG value={`ticket:${formData.guestId}`} size={184} level="H" bgColor="#ffffff" fgColor="#000000" />
              </div>

              <p className="text-sm text-muted-foreground font-medium">{formData.firstName} {formData.lastName}</p>
              <p className="text-xs text-muted-foreground font-mono">{ticketId ? `TICKET-${ticketId}` : "TICKET-GENERATED"}</p>

              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <Button variant="hero" size="lg" className="flex-1"><Wallet className="w-5 h-5" /> Add to Wallet</Button>
                <Button variant="heroOutline" size="lg" className="flex-1"><Mail className="w-5 h-5" /> Email QR Code</Button>
              </div>

              <Button variant="outline" size="lg" className="mt-6 w-full" onClick={() => {
                setFormData({
                  firstName: '',
                  lastName: '',
                  email: '',
                  phone: '',
                  guestCategory: '',
                  companyOrIndividual: '',
                  dietaryRestrictions: settings.dietaryOptions[0],
                  agreeTerms: false,
                  agreeMarketing: false,
                  guestId: '',
                  status: "pending",
                  amountPaid: 0,
                  customFields: {},
                });
                setTicketId(null);
                setStep(1);
              }}>
                Register Someone Else
              </Button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default Registration;
