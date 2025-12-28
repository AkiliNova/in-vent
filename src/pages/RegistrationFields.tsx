"use client";

import { useState, useEffect } from "react";
import { db } from "@/firebase/firebase";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import Navigation from "@/components/Navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type FieldType = "text" | "number" | "email" | "select" | "checkbox" | "textarea";

interface AdminField {
  id?: string;
  label: string;
  type: FieldType;
  required: boolean;
  step: 1 | 2;
  order: number;
  placeholder?: string;
  options?: string[];
  enabled: boolean;
}

export default function AdminFields() {
  const { tenantId } = useAuth();
  const [fields, setFields] = useState<AdminField[]>([]);
  const [newField, setNewField] = useState<AdminField>({
    label: "",
    type: "text",
    required: false,
    step: 1,
    order: 1,
    enabled: true,
    options: [],
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load existing fields
  const loadFields = async () => {
    if (!tenantId) return;
    const snap = await getDocs(collection(db, `tenants/${tenantId}/registration_fields`));
    setFields(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminField)));
  };

  useEffect(() => {
    if (tenantId) loadFields();
  }, [tenantId]);

  // Add new field
  const addField = async () => {
    if (!newField.label) return;
    await addDoc(collection(db, `tenants/${tenantId}/registration_fields`), newField);
    setNewField({ ...newField, label: "", order: fields.length + 2 });
    loadFields();
  };

  // Update a field
  const updateField = async (id: string, updates: Partial<AdminField>) => {
    await updateDoc(doc(db, `tenants/${tenantId}/registration_fields`, id), updates);
    setEditingId(null);
    loadFields();
  };

  // Delete a field
  const deleteField = async (id: string) => {
    if (!confirm("Are you sure you want to delete this field?")) return;
    await deleteDoc(doc(db, `tenants/${tenantId}/registration_fields`, id));
    loadFields();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="glass rounded-3xl p-8">
            <h2 className="text-2xl font-bold mb-6">Manage Registration Fields</h2>

            {/* Add New Field */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 items-end">
              <div className="flex flex-col">
                <Label className="mb-1">Field Label</Label>
                <Input
                  className="h-12 bg-background text-foreground placeholder:text-muted-foreground"
                  placeholder="Enter field label"
                  value={newField.label}
                  onChange={e => setNewField({ ...newField, label: e.target.value })}
                />
              </div>

              <div className="flex flex-col">
                <Label className="mb-1">Field Type</Label>
                <Select
                  value={newField.type}
                  onValueChange={val => setNewField({ ...newField, type: val as FieldType })}
                >
                  <SelectTrigger className="h-12 bg-background text-foreground">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {["text", "number", "email", "select", "checkbox", "textarea"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col">
                <Label className="mb-1">Step</Label>
                <Select
                  value={newField.step.toString()}
                  onValueChange={val => setNewField({ ...newField, step: Number(val) as 1 | 2 })}
                >
                  <SelectTrigger className="h-12 bg-background text-foreground">
                    <SelectValue placeholder="Step" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col items-start">
                <Label className="mb-1">&nbsp;</Label>
                <Button className="h-12 w-full" onClick={addField}>Add Field</Button>
              </div>
            </div>

            {/* Existing Fields */}
            <div className="space-y-2">
              {fields.map(f => {
                const isEditing = editingId === f.id;
                return (
                  <div key={f.id} className="flex justify-between items-center border p-3 rounded-xl bg-background/50">
                    {isEditing ? (
                      <div className="flex flex-col w-full gap-2">
                        <Input
                          value={f.label}
                          onChange={e => updateField(f.id!, { label: e.target.value })}
                          placeholder="Label"
                        />
                        <Select
                          value={f.type}
                          onValueChange={val => updateField(f.id!, { type: val as FieldType })}
                        >
                          <SelectTrigger className="h-10 bg-background text-foreground">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            {["text", "number", "email", "select", "checkbox", "textarea"].map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={f.step.toString()}
                          onValueChange={val => updateField(f.id!, { step: Number(val) as 1 | 2 })}
                        >
                          <SelectTrigger className="h-10 bg-background text-foreground">
                            <SelectValue placeholder="Step" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={f.required}
                            onCheckedChange={val => updateField(f.id!, { required: Boolean(val) })}
                          /> Required
                          <Checkbox
                            checked={f.enabled}
                            onCheckedChange={val => updateField(f.id!, { enabled: Boolean(val) })}
                          /> Enabled
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => setEditingId(null)}>Done</Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteField(f.id!)}>Delete</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1">
                          <div className="font-medium">{f.label}</div>
                          <div className="text-sm text-muted-foreground">
                            Type: {f.type} — Step {f.step} — Required: {f.required ? "Yes" : "No"} — Enabled: {f.enabled ? "Yes" : "No"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => setEditingId(f.id!)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteField(f.id!)}>Delete</Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
