import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/firebase";

interface FormData {
  organizationName: string;
  contactPerson: string;
  email: string;
  phone: string;
  password: string;
  package: string | null;
}

interface Package {
  id: string;
  name: string;
  price: string;
  features: string[];
}

const OrganizerOnboarding: React.FC = () => {
  const [step, setStep] = useState<number>(1);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const [formData, setFormData] = useState<FormData>({
    organizationName: "",
    contactPerson: "",
    email: "",
    phone: "",
    password: "",
    package: null,
  });

  const navigate = useNavigate();

  const packages: Package[] = [
    {
      id: "basic",
      name: "Basic",
      price: "KSh 1,500 / event",
      features: ["QR Code Check-In", "Guest List Management", "Basic Analytics"],
    },
    {
      id: "pro",
      name: "Pro",
      price: "KSh 3,500 / event",
      features: [
        "Everything in Basic",
        "Real-Time Scan Dashboard",
        "Bulk SMS Invites",
        "Unlimited Guests",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Custom Pricing",
      features: [
        "Unlimited Events",
        "Custom Branding",
        "Dedicated Support",
        "Advanced Analytics",
      ],
    },
  ];

  const selectedPackage = packages.find((p) => p.id === formData.package);

  const handleNext = () => setStep((prev) => prev + 1);
  const handleBack = () => setStep((prev) => prev - 1);

  const completeOnboarding = async () => {
    if (!formData.email || !formData.password || !formData.organizationName) return;

    setLoading(true);
    try {
      const auth = getAuth();

      // 1️⃣ Create Firebase Auth User
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const user = userCredential.user;

      // 2️⃣ Create Tenant in Firestore
      const tenantRef = doc(db, "tenants", user.uid);
      await setDoc(tenantRef, {
        organizationName: formData.organizationName,
        contactPerson: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        package: formData.package,
        createdAt: serverTimestamp(),
        admins: [user.uid], // organizer is the admin
      });

      // 3️⃣ Create Admin doc for multi-tenant lookup
      const adminRef = doc(db, "admins", user.uid);
      await setDoc(adminRef, {
        email: formData.email,
        tenantId: user.uid,
        role: "admin",
        createdAt: serverTimestamp(),
      });

      // 4️⃣ Navigate to dashboard
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Error creating tenant/admin:", error);
      alert(error.message || "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full px-6 pt-32 pb-20 bg-background">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">
          {step === 1 && "Create Your Organizer Account"}
          {step === 2 && "Select a Package"}
          {step === 3 && "Review & Confirm"}
        </h1>

        {/* STEP 1 — Organizer Info */}
        {step === 1 && (
          <Card className="p-6">
            <div className="grid grid-cols-1 gap-4">
              <Input
                placeholder="Organization Name"
                value={formData.organizationName}
                onChange={(e) =>
                  setFormData({ ...formData, organizationName: e.target.value })
                }
              />
              <Input
                placeholder="Contact Person"
                value={formData.contactPerson}
                onChange={(e) =>
                  setFormData({ ...formData, contactPerson: e.target.value })
                }
              />
              <Input
                placeholder="Email Address"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
              <Input
                placeholder="Phone Number"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
              <Input
                placeholder="Password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />

              <div className="flex justify-between mt-6">
                <Button variant="ghost" asChild>
                  <Link to="/">Cancel</Link>
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={
                    !formData.organizationName ||
                    !formData.email ||
                    !formData.password
                  }
                >
                  Continue
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* STEP 2 — Package Selection */}
        {step === 2 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`cursor-pointer border-2 transition ${
                    formData.package === pkg.id
                      ? "border-primary shadow-lg"
                      : "border-muted"
                  }`}
                  onClick={() => setFormData({ ...formData, package: pkg.id })}
                >
                  <CardHeader>
                    <CardTitle className="text-xl font-bold">{pkg.name}</CardTitle>
                    <p className="text-muted-foreground">{pkg.price}</p>
                  </CardHeader>

                  <CardContent>
                    <ul className="space-y-2">
                      {pkg.features.map((feat, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-primary" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-between mt-8">
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>

              <Button onClick={handleNext} disabled={!formData.package}>
                Continue
              </Button>
            </div>
          </>
        )}

        {/* STEP 3 — Review & Checkout */}
        {step === 3 && (
          <Card className="p-6 space-y-4">
            <h2 className="text-2xl font-semibold">Review Your Selection</h2>

            <div className="border rounded-lg p-4 space-y-1">
              <p>
                <strong>Organization:</strong> {formData.organizationName}
              </p>
              <p>
                <strong>Email:</strong> {formData.email}
              </p>
              <p>
                <strong>Package:</strong> {selectedPackage?.name}
              </p>
              <p>
                <strong>Price:</strong> {selectedPackage?.price}
              </p>
            </div>

            <p className="text-muted-foreground">
              Proceed to checkout to activate your organizer account.
            </p>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>

              {/* Dialog Trigger */}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button disabled={loading}>
                    {loading ? "Creating..." : "Proceed to Checkout"}
                  </Button>
                </DialogTrigger>

                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm Checkout</DialogTitle>
                    <DialogDescription>
                      You are about to sign up for the{" "}
                      <strong>{selectedPackage?.name}</strong> package.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="p-4 border rounded-lg">
                    <p>
                      <strong>Organization:</strong> {formData.organizationName}
                    </p>
                    <p>
                      <strong>Email:</strong> {formData.email}
                    </p>
                    <p>
                      <strong>Package:</strong> {selectedPackage?.name}
                    </p>
                    <p>
                      <strong>Price:</strong> {selectedPackage?.price}
                    </p>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>

                    <Button onClick={completeOnboarding} disabled={loading}>
                      {loading ? "Creating Tenant..." : "Confirm & Continue"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default OrganizerOnboarding;
