"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Tag, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import Navigation from "@/components/Navigation";
import { toast } from "@/hooks/use-toast";
import { db } from "@/firebase/firebase";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

interface PromoCode {
  id: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  active: boolean;
  createdAt?: any;
}

const PromoCodes = () => {
  const { tenantId } = useAuth();
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    discountType: "percent" as "percent" | "fixed",
    discountValue: 10,
    maxUses: 100,
    expiresAt: "",
  });

  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(collection(db, `tenants/${tenantId}/promo_codes`), snap => {
      setCodes(snap.docs.map(d => ({ id: d.id, ...d.data() } as PromoCode)));
    });
    return () => unsub();
  }, [tenantId]);

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setForm(f => ({ ...f, code }));
  };

  const saveCode = async () => {
    if (!form.code.trim()) {
      toast({ title: "Enter a promo code", variant: "destructive" });
      return;
    }
    if (form.discountValue <= 0) {
      toast({ title: "Discount must be greater than 0", variant: "destructive" });
      return;
    }
    if (form.discountType === "percent" && form.discountValue > 100) {
      toast({ title: "Percent discount cannot exceed 100%", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `tenants/${tenantId}/promo_codes`), {
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue: form.discountValue,
        maxUses: form.maxUses,
        usedCount: 0,
        expiresAt: form.expiresAt || null,
        active: true,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Promo code created!" });
      setModalOpen(false);
      setForm({ code: "", discountType: "percent", discountValue: 10, maxUses: 100, expiresAt: "" });
    } catch (err: any) {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteCode = async (id: string) => {
    if (!confirm("Delete this promo code?")) return;
    try {
      await deleteDoc(doc(db, `tenants/${tenantId}/promo_codes`, id));
      toast({ title: "Deleted" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Code copied!" });
  };

  const isExpired = (expiresAt: string) => expiresAt && new Date(expiresAt) < new Date();
  const isExhausted = (c: PromoCode) => c.usedCount >= c.maxUses;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Promo Codes</h1>
              <p className="text-muted-foreground">Create discount codes for your events</p>
            </div>
            <Button variant="hero" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create Code
            </Button>
          </div>

          {codes.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No promo codes yet. Create your first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {codes.map(c => {
                const expired = isExpired(c.expiresAt);
                const exhausted = isExhausted(c);
                const active = c.active && !expired && !exhausted;

                return (
                  <div key={c.id} className="glass rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono font-bold text-lg text-foreground tracking-wider">{c.code}</span>
                        <Badge variant={active ? "default" : "secondary"} className={active ? "bg-success/20 text-success border-success/30" : ""}>
                          {expired ? "Expired" : exhausted ? "Exhausted" : "Active"}
                        </Badge>
                        <Badge variant="outline">
                          {c.discountType === "percent" ? `${c.discountValue}% off` : `KES ${c.discountValue} off`}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                        <span>{c.usedCount} / {c.maxUses} uses</span>
                        {c.expiresAt && <span>Expires {new Date(c.expiresAt).toLocaleDateString()}</span>}
                      </div>
                      {/* Usage bar */}
                      <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, (c.usedCount / c.maxUses) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="outline" size="icon" onClick={() => copyCode(c.code)}>
                        {copied === c.code ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => deleteCode(c.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create Promo Code</DialogTitle>
            <DialogDescription>Set the code, discount, and usage limits.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <Label>Promo Code *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. EARLYBIRD20"
                  className="font-mono"
                />
                <Button variant="outline" onClick={generateCode} type="button">Generate</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Discount Type</Label>
                <select
                  value={form.discountType}
                  onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "percent" | "fixed" }))}
                  className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed (KES)</option>
                </select>
              </div>
              <div>
                <Label>{form.discountType === "percent" ? "Discount %" : "Discount KES"}</Label>
                <Input
                  type="number"
                  min={1}
                  max={form.discountType === "percent" ? 100 : undefined}
                  value={form.discountValue}
                  onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Max Uses</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.maxUses}
                  onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Expires On (optional)</Label>
                <Input
                  type="date"
                  value={form.expiresAt}
                  onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            {form.discountValue > 0 && form.code && (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-foreground">
                Code <span className="font-mono font-bold">{form.code}</span> gives{" "}
                {form.discountType === "percent" ? `${form.discountValue}% off` : `KES ${form.discountValue} off`},{" "}
                up to {form.maxUses} uses.
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="hero" onClick={saveCode} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PromoCodes;
