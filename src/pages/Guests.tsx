"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Filter, Download, UserPlus, Mail, Phone, Check, X, Crown,
  MoreHorizontal, ChevronLeft, ChevronRight, Eye, Pencil, Trash2, Send
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sendSms } from "@/utils/sendSms";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import Navigation from "@/components/Navigation";
import { db } from "@/firebase/firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, addDoc, serverTimestamp, getDoc } from "firebase/firestore";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useAuth } from "@/context/AuthContext"; // assume you have a hook for auth and tenant

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  companyOrIndividual: string;
  ticketType: "VIP" | "General" | "Speaker" | "Press";
  status: "checked-in" | "pending" | "no-show";
  checkedInAt?: string;
  registeredAt: string;
  amountPaid: 0;
  customFields?: Record<string, any>;
}

function PaginationControls({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  const pages: (number | "…")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) pages.push(i);
    if (page < total - 2) pages.push("…");
    pages.push(total);
  }
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "hero" : "outline"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onChange(p as number)}
          >
            {p}
          </Button>
        )
      )}
      <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === total} onClick={() => onChange(page + 1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

const Guests = () => {
  const { tenantId } = useAuth(); // tenant-aware
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ticketFilter, setTicketFilter] = useState<"all" | Guest["ticketType"]>("all");
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewGuest, setViewGuest] = useState<Guest | null>(null);
  const [editGuest, setEditGuest] = useState<Guest | null>(null);
  const [editForm, setEditForm] = useState<Partial<Guest>>({});
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [msgForm, setMsgForm] = useState({ subject: "", message: "" });
  const [isSending, setIsSending] = useState(false);

  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSendAll, setSmsSendAll] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportCols, setExportCols] = useState<{ key: string; label: string; checked: boolean; isCustom?: boolean }[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, ticketFilter]);

  // -----------------------------
  // Fetch guests (tenant-aware)
  // -----------------------------
  useEffect(() => {
    if (!tenantId) return;

    const fetchGuests = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "tenants", tenantId, "guests"));
        const snapshot = await getDocs(q);
        const guestList: Guest[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            firstName: data.firstName,
            lastName: data.lastName,
            name: `${data.firstName} ${data.lastName}`,
            email: data.email,
            phone: data.phone,
            companyOrIndividual: data.companyOrIndividual || "",
            ticketType: data.ticketType || "General",
            status: data.checkedIn ? "checked-in" : data.status || "pending",
            checkedInAt: data.checkedInAt || (data.checkedIn ? new Date(data.checkedInAt || Date.now()).toLocaleTimeString() : undefined),
            registeredAt: data.registeredAt || "",
            amountPaid: data.amountPaid || 0,
            customFields: data.customFields || {},
          };
        });
        setGuests(guestList);
      } catch (error) {
        console.error("Error fetching guests:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGuests();
  }, [tenantId]);

  // -----------------------------
  // CRUD operations (tenant-aware)
  // -----------------------------
  const handleCheckIn = async (guest: Guest) => {
    if (!tenantId) return;
    const status = guest.status === "checked-in" ? "pending" : "checked-in";
    try {
      const docRef = doc(db, "tenants", tenantId, "guests", guest.id);
      await updateDoc(docRef, {
        status,
        checkedInAt: status === "checked-in" ? new Date().toISOString() : null,
      });
      setGuests((prev) =>
        prev.map((g) =>
          g.id === guest.id
            ? { ...g, status, checkedInAt: status === "checked-in" ? new Date().toLocaleTimeString() : null }
            : g
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteGuest = async (id: string) => {
    if (!tenantId) return;
    if (!confirm("Are you sure you want to delete this guest?")) return;
    try {
      const docRef = doc(db, "tenants", tenantId, "guests", id);
      await deleteDoc(docRef);
      setGuests((prev) => prev.filter((g) => g.id !== id));
    } catch (error) {
      console.error(error);
    }
  };

  const handleEditGuest = (guest: Guest) => {
    setEditGuest(guest);
    setEditForm({ ...guest });
  };

  const saveGuestEdits = async () => {
    if (!tenantId || !editGuest) return;
    try {
      const docRef = doc(db, "tenants", tenantId, "guests", editGuest.id);
      await updateDoc(docRef, editForm);
      setGuests((prev) =>
        prev.map((g) => (g.id === editGuest.id ? { ...g, ...editForm } : g))
      );
      setEditGuest(null);
    } catch (error) {
      console.error(error);
    }
  };

  // -----------------------------
  // Filter & select helpers
  // -----------------------------
  const filteredGuests = guests.filter((guest) => {
    const matchesSearch =
      guest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.companyOrIndividual.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || guest.status === statusFilter;

    const matchesTicket =
      ticketFilter === "all" || guest.ticketType === ticketFilter;

    return matchesSearch && matchesStatus && matchesTicket;
  });

  const totalPages = Math.max(1, Math.ceil(filteredGuests.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedGuests = filteredGuests.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Summary stats (always over full guest list, not filtered)
  const checkedIn = guests.filter(g => g.status === "checked-in").length;
  const pending   = guests.filter(g => g.status === "pending").length;
  const noShow    = guests.filter(g => g.status === "no-show").length;
  const totalRevenue = guests.reduce((sum, g) => sum + (g.amountPaid || 0), 0);

  const toggleSelectAll = () => {
    if (selectedGuests.length === filteredGuests.length) {
      setSelectedGuests([]);
    } else {
      setSelectedGuests(filteredGuests.map((g) => g.id));
    }
  };

  const toggleSelectGuest = (id: string) => {
    setSelectedGuests((prev) =>
      prev.includes(id) ? prev.filter((gId) => gId !== id) : [...prev, id]
    );
  };

  // -----------------------------
  // Badges & export
  // -----------------------------
  const getStatusBadge = (status: Guest["status"]) => {
    switch (status) {
      case "checked-in":
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20 text-success text-xs"><Check className="w-3 h-3" /> Checked In</span>;
      case "pending":
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-xs">Pending</span>;
      case "no-show":
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/20 text-destructive text-xs"><X className="w-3 h-3" /> No Show</span>;
    }
  };

  const getTicketBadge = (type: Guest["ticketType"]) => {
    const colors: Record<string, string> = {
      VIP: "bg-yellow-500/20 text-yellow-500",
      Speaker: "bg-primary/20 text-primary",
      Press: "bg-purple-500/20 text-purple-500",
      General: "bg-muted text-muted-foreground",
    };
    return <span className={`px-2 py-1 rounded-full text-xs ${colors[type]}`}>{type === "VIP" && <Crown className="w-3 h-3 inline mr-1" />}{type}</span>;
  };
  const formatDate = (isoString: string | undefined) => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openExportModal = () => {
    if (guests.length === 0) return;
    const fixed = [
      { key: "name", label: "Name", checked: true },
      { key: "email", label: "Email", checked: true },
      { key: "phone", label: "Phone", checked: true },
      { key: "companyOrIndividual", label: "Company", checked: true },
      { key: "ticketType", label: "Ticket", checked: true },
      { key: "status", label: "Status", checked: true },
      { key: "checkedInAt", label: "Checked In At", checked: true },
      { key: "registeredAt", label: "Registered At", checked: true },
      { key: "amountPaid", label: "Amount Paid (KES)", checked: true },
    ];
    const custom = Object.entries(registrationFields).map(([fieldId, label]) => ({
      key: fieldId, label, checked: true, isCustom: true,
    }));
    setExportCols([...fixed, ...custom]);
    setShowExportModal(true);
  };

  const runExport = async () => {
    const activeCols = exportCols.filter((c) => c.checked);
    if (activeCols.length === 0) {
      toast({ title: "Select at least one column", variant: "destructive" }); return;
    }

    setIsExporting(true);
    try {
      const dataToExport = selectedGuests.length > 0
        ? guests.filter((g) => selectedGuests.includes(g.id))
        : guests;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Tikooh";
      const ws = workbook.addWorksheet("Guests");

      // ── Logo ────────────────────────────────────────────────────────────
      try {
        const logoRes = await fetch("/assets/logo.png");
        const logoBuffer = await logoRes.arrayBuffer();
        const logoId = workbook.addImage({ buffer: logoBuffer, extension: "png" });
        ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 160, height: 52 } });
      } catch (_) {}

      // ── Header info ──────────────────────────────────────────────────────
      ws.getRow(1).height = 20; ws.getRow(2).height = 18;
      ws.getRow(3).height = 16; ws.getRow(4).height = 16;

      const titleCell = ws.getCell("C1");
      titleCell.value = orgName || "Tikooh";
      titleCell.font = { bold: true, size: 14 };

      const subtitleCell = ws.getCell("C2");
      subtitleCell.value = "Guest Export Report";
      subtitleCell.font = { bold: true, size: 11, color: { argb: "FF6B6BF9" } };

      ws.getCell("C3").value = `Exported: ${new Date().toLocaleString()}`;
      ws.getCell("C3").font = { size: 9, color: { argb: "FF888888" } };

      ws.getCell("C4").value = `Total guests: ${dataToExport.length}  ·  Columns: ${activeCols.map(c => c.label).join(", ")}`;
      ws.getCell("C4").font = { size: 9, color: { argb: "FF888888" } };

      ws.addRow([]); // separator

      // ── Column headers ───────────────────────────────────────────────────
      const headerRow = ws.addRow(activeCols.map((c) => c.label));
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E1E2E" } };
        cell.alignment = { vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: "FF6B6BF9" } } };
      });
      headerRow.height = 20;

      // ── Data rows ────────────────────────────────────────────────────────
      const colWidthMap: Record<string, number> = {
        name: 30, email: 32, phone: 16, companyOrIndividual: 24,
        ticketType: 12, status: 14, checkedInAt: 22, registeredAt: 22, amountPaid: 18,
      };

      dataToExport.forEach((g) => {
        const values = activeCols.map((col) => {
          if (col.isCustom) return g.customFields?.[col.key] ?? "";
          if (col.key === "checkedInAt") return formatDate(g.checkedInAt);
          if (col.key === "registeredAt") return formatDate(g.registeredAt);
          return (g as any)[col.key] ?? "";
        });
        const row = ws.addRow(values);
        row.eachCell((cell) => { cell.alignment = { vertical: "middle" }; });
      });

      ws.columns = activeCols.map((col) => ({ width: colWidthMap[col.key] ?? 20 }));

      // ── Save ─────────────────────────────────────────────────────────────
      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `guests-${(orgName || "export").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      saveAs(new Blob([buffer], { type: "application/octet-stream" }), filename);
      setShowExportModal(false);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const [registrationFields, setRegistrationFields] = useState<Record<string, string>>({});
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    if (!tenantId) return;

    const fetchFields = async () => {
      const snap = await getDocs(collection(db, `tenants/${tenantId}/registration_fields`));
      const fieldsMap: Record<string, string> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        fieldsMap[doc.id] = data.label;
      });
      setRegistrationFields(fieldsMap);
    };

    const fetchOrgName = async () => {
      try {
        const tenantSnap = await getDoc(doc(db, "tenants", tenantId));
        if (tenantSnap.exists()) setOrgName(tenantSnap.data().organizationName || "");
      } catch (_) {}
    };

    fetchFields();
    fetchOrgName();
  }, [tenantId]);
  const sendBulkSms = async () => {
    if (!smsMessage.trim()) {
      toast({ title: "Enter a message", variant: "destructive" }); return;
    }
    const targets = smsSendAll
      ? guests
      : guests.filter(g => selectedGuests.includes(g.id));
    const phones = targets.map(g => g.phone).filter(Boolean);
    if (!phones.length) {
      toast({ title: "No phone numbers found", variant: "destructive" }); return;
    }
    setIsSendingSms(true);
    try {
      const result = await sendSms(phones, smsMessage);
      toast({
        title: `SMS sent to ${result.sent} guests`,
        description: result.failed.length ? `${result.failed.length} failed` : undefined,
      });
      setShowSmsModal(false);
      setSmsMessage("");
    } catch (err: any) {
      toast({ title: "SMS failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSendingSms(false);
    }
  };

  const sendBulkMessage = async () => {
    if (!msgForm.message.trim() || !tenantId) {
      toast({ title: "Enter a message", variant: "destructive" }); return;
    }
    setIsSending(true);
    try {
      const targets = guests.filter(g => selectedGuests.includes(g.id));
      await addDoc(collection(db, `tenants/${tenantId}/campaigns`), {
        name: msgForm.subject || `Message to ${targets.length} guests`,
        type: "email",
        audience: "custom",
        subject: msgForm.subject,
        message: msgForm.message,
        status: "sent",
        sent: targets.length,
        delivered: targets.length,
        sentAt: new Date().toISOString(),
        recipientIds: selectedGuests,
        createdAt: serverTimestamp(),
      });
      toast({ title: `Message sent to ${targets.length} guests!` });
      setShowMessageModal(false);
      setMsgForm({ subject: "", message: "" });
      setSelectedGuests([]);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

const navigate = useNavigate();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Guest Management</h1>
              <p className="text-muted-foreground">View and manage all event attendees</p>
            </div>
            <div className="flex items-center gap-3 mt-4 md:mt-0">
              <Button variant="outline" size="sm" onClick={openExportModal}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSmsSendAll(false); setShowSmsModal(true); }}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                SMS
              </Button>
              <Button
                variant="hero"
                size="sm"
                onClick={() => navigate("/register")}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Guest
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="glass rounded-2xl p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or company..."
                  className="pl-10 h-11"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48 h-11">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="checked-in">Checked In</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="no-show">No Show</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ticketFilter} onValueChange={(v) => setTicketFilter(v as any)}>
                <SelectTrigger className="w-full md:w-48 h-11">
                  <Crown className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Ticket type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tickets</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Speaker">Speaker</SelectItem>
                  <SelectItem value="Press">Press</SelectItem>
                </SelectContent>
              </Select>

              {selectedGuests.length > 0 && (
                <Button variant="hero" onClick={() => setShowMessageModal(true)}>
                  <Send className="w-4 h-4 mr-2" />
                  Message ({selectedGuests.length})
                </Button>
              )}
            </div>
          </div>


          {/* Summary + top pagination */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            {/* Stats */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-full bg-secondary text-muted-foreground">
                Total <strong className="text-foreground ml-1">{guests.length}</strong>
              </span>
              <span className="px-3 py-1.5 rounded-full bg-success/10 text-success">
                Checked in <strong className="ml-1">{checkedIn}</strong>
              </span>
              <span className="px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-500">
                Pending <strong className="ml-1">{pending}</strong>
              </span>
              <span className="px-3 py-1.5 rounded-full bg-destructive/10 text-destructive">
                No-show <strong className="ml-1">{noShow}</strong>
              </span>
              <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary">
                Revenue <strong className="ml-1">KES {totalRevenue.toLocaleString()}</strong>
              </span>
            </div>
            {/* Top pagination */}
            <PaginationControls page={safePage} total={totalPages} onChange={(p) => setCurrentPage(p)} />
          </div>

          {/* Guest Table */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-4 text-left">
                      <Checkbox
                        checked={selectedGuests.length === filteredGuests.length && filteredGuests.length > 0}
                        onCheckedChange={toggleSelectAll}
                        title="Select all filtered"
                      />
                    </th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Guest</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">Contact</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Company</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Ticket</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Amount Paid</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Check-in</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Custom Fields</th>
                    <th className="p-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGuests.map((guest) => (
                    <tr
                      key={guest.id}
                      className="border-b border-border/50 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="p-4">
                        <Checkbox
                          checked={selectedGuests.includes(guest.id)}
                          onCheckedChange={() => toggleSelectGuest(guest.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {guest.name.split(" ").map((n) => n[0]).join("")}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{guest.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden">{guest.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="w-3 h-3" /> {guest.email}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" /> {guest.phone}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden lg:table-cell">{guest.companyOrIndividual}</td>
                      <td className="p-4">{getTicketBadge(guest.ticketType)}</td>
                      <td className="p-4">Ksh {guest.amountPaid.toFixed(2)}</td>
                      <td className="p-4">{getStatusBadge(guest.status)}</td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">{formatDate(guest.checkedInAt) || "—"}</span>
                        <Button
                          size="sm"
                          className="ml-2"
                          onClick={() => handleCheckIn(guest)}
                        >
                          {guest.status === "checked-in" ? "Undo" : "Check In"}
                        </Button>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 text-sm text-foreground">
                          {guest.customFields
                            ? Object.entries(guest.customFields).map(([fieldId, value]) => (
                              <div key={fieldId}>
                                <span className="font-medium">
                                  {registrationFields[fieldId] || fieldId}:
                                </span>{" "}
                                {value.toString()}
                              </div>
                            ))
                            : <span className="text-muted-foreground">—</span>
                          }
                        </div>
                      </td>

                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewGuest(guest)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditGuest(guest)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Send className="w-4 h-4 mr-2" />
                              Send Message
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteGuest(guest.id)}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>


          {/* Bottom pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border mt-4">
            <p className="text-sm text-muted-foreground">
              Showing <strong className="text-foreground">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredGuests.length)}</strong> of <strong className="text-foreground">{filteredGuests.length}</strong> guests
              {filteredGuests.length !== guests.length && <span className="ml-1">(filtered from {guests.length})</span>}
            </p>
            <PaginationControls page={safePage} total={totalPages} onChange={(p) => setCurrentPage(p)} />
          </div>
        </div>
      </main>

      {/* View Guest Modal */}
      {viewGuest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-2xl w-96">
            <h2 className="text-xl font-bold mb-2">{viewGuest.name}</h2>
            <p><strong>Email:</strong> {viewGuest.email}</p>
            <p><strong>Phone:</strong> {viewGuest.phone}</p>
            <p><strong>Company:</strong> {viewGuest.companyOrIndividual}</p>
            <p><strong>Ticket Type:</strong> {viewGuest.ticketType}</p>
            <p><strong>Status:</strong> {viewGuest.status}</p>
            <p><strong>Checked In At:</strong> {viewGuest.checkedInAt || '—'}</p>
            <p><strong>Registered At:</strong> {viewGuest.registeredAt}</p>
            <p><strong>Amount Paid:</strong> Ksh {viewGuest.amountPaid.toFixed(2)}</p>
            <div className="mt-4">
              <h3 className="font-medium mb-2">Custom Fields:</h3>
              {viewGuest.customFields ? (
                <div className="space-y-1">
                  {Object.entries(viewGuest.customFields).map(([fieldId, value]) => (
                    <p key={fieldId}>
                      <strong>{registrationFields[fieldId] || fieldId}:</strong> {value.toString()}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No custom fields.</p>
              )}
            </div>
            <Button className="mt-4 w-full" onClick={() => setViewGuest(null)}>Close</Button>
          </div>
        </div>
      )}

      {/* Bulk Message Modal */}
      {showMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Message {selectedGuests.length} Guests</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowMessageModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Subject</label>
              <Input
                className="mt-1"
                placeholder="Subject line"
                value={msgForm.subject}
                onChange={e => setMsgForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Message *</label>
              <textarea
                rows={5}
                className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Write your message..."
                value={msgForm.message}
                onChange={e => setMsgForm(f => ({ ...f, message: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowMessageModal(false)}>Cancel</Button>
              <Button variant="hero" className="flex-1" onClick={sendBulkMessage} disabled={isSending}>
                <Send className="w-4 h-4 mr-2" />
                {isSending ? "Sending..." : `Send to ${selectedGuests.length}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Export Column Picker Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Export Columns</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedGuests.length > 0 ? `${selectedGuests.length} selected guests` : `All ${guests.length} guests`}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowExportModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Select all / none */}
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm font-medium text-foreground">
                {exportCols.filter(c => c.checked).length} / {exportCols.length} selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-xs h-7"
                  onClick={() => setExportCols(cols => cols.map(c => ({ ...c, checked: true })))}>
                  All
                </Button>
                <Button variant="ghost" size="sm" className="text-xs h-7"
                  onClick={() => setExportCols(cols => cols.map(c => ({ ...c, checked: false })))}>
                  None
                </Button>
              </div>
            </div>

            {/* Column list */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {exportCols.map((col, i) => (
                <label key={col.key} className="flex items-center gap-3 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-secondary/50 transition-colors">
                  <Checkbox
                    checked={col.checked}
                    onCheckedChange={(v) =>
                      setExportCols(prev => prev.map((c, idx) => idx === i ? { ...c, checked: !!v } : c))
                    }
                  />
                  <span className="text-sm text-foreground">{col.label}</span>
                  {col.isCustom && (
                    <span className="ml-auto text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">custom</span>
                  )}
                </label>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowExportModal(false)}>Cancel</Button>
              <Button variant="hero" className="flex-1" onClick={runExport} disabled={isExporting}>
                <Download className="w-4 h-4 mr-2" />
                {isExporting ? "Exporting…" : "Export"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Modal */}
      {showSmsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" /> Send SMS
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">via Advanta SMS</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowSmsModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Audience toggle */}
            <div className="flex rounded-xl overflow-hidden border border-border">
              <button
                className={`flex-1 py-2 text-sm font-medium transition-colors ${!smsSendAll ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
                onClick={() => setSmsSendAll(false)}
              >
                Selected ({selectedGuests.length || 0})
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium transition-colors ${smsSendAll ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
                onClick={() => setSmsSendAll(true)}
              >
                All Guests ({guests.length})
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-foreground">Message *</label>
                <span className={`text-xs ${smsMessage.length > 160 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                  {smsMessage.length} chars · {Math.ceil(smsMessage.length / 160) || 1} SMS
                </span>
              </div>
              <textarea
                rows={4}
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Type your SMS message…"
                value={smsMessage}
                onChange={e => setSmsMessage(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowSmsModal(false)}>Cancel</Button>
              <Button
                variant="hero"
                className="flex-1"
                onClick={sendBulkSms}
                disabled={isSendingSms || !smsMessage.trim() || (!smsSendAll && selectedGuests.length === 0)}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                {isSendingSms ? "Sending…" : `Send to ${smsSendAll ? guests.length : selectedGuests.length}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Guest Modal */}
      {editGuest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-2xl w-96">
            <h2 className="text-xl font-bold mb-4">Edit {editGuest.name}</h2>
            <div className="space-y-2">
              <Input
                placeholder="First Name"
                value={editForm.firstName || ""}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
              />
              <Input
                placeholder="Last Name"
                value={editForm.lastName || ""}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
              />
              <Input
                placeholder="Email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
              <Input
                placeholder="Phone"
                value={editForm.phone || ""}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <Button className="flex-1" onClick={saveGuestEdits}>Save</Button>
              <Button className="flex-1" variant="outline" onClick={() => setEditGuest(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Guests;
