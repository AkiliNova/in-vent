"use client";

import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Building,
  Bell,
  Shield,
  Palette,
  Webhook,
  Key,
  Users,
  Globe,
  Mail,
  Smartphone,
  Save,
  ExternalLink,
  Check,
  AlertTriangle
} from "lucide-react";

import { db } from "@/firebase/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { toast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";

// Default values
const defaultSettings = {
  eventName: "Tech Summit 2024",
  eventDate: "2024-11-20",
  venue: "Convention Center",
  timezone: "America/New_York",
  capacity: 1500,
  enableGeofencing: true,
  geofenceRadius: 200,
  enableOfflineMode: true,
  enableBadgePrinting: true,
  enableSponsorFooter: true,
  emailNotifications: true,
  smsNotifications: true,
  capacityAlerts: true,
  vipAlerts: true,
  flaggedEntryAlerts: true,
  dataRetention: "90",
  requireConsent: true,
  anonymizeAfter: "365",
};

const Settings = () => {
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  // -------------------------------------------
  // LOAD SETTINGS FROM FIRESTORE
  // -------------------------------------------
  useEffect(() => {
    const load = async () => {
      try {
        const ref = doc(db, "app_settings", "global");
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setSettings({ ...defaultSettings, ...snap.data() });
        }

      } catch (error) {
        console.error("Failed to load settings:", error);
        toast({ title: "Error", description: "Failed to load settings", variant: "destructive" });
      }

      setLoading(false);
    };

    load();
  }, []);

  // -------------------------------------------
  // SAVE TO FIRESTORE
  // -------------------------------------------
  const handleSave = async () => {
    try {
      await setDoc(doc(db, "app_settings", "global"), settings, { merge: true });

      toast({
        title: "Settings Saved",
        description: "Your changes have been saved successfully.",
      });

    } catch (error) {
      console.error("SAVE FAILED:", error);
      toast({
        title: "Failed to Save",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const integrations = [
    { name: "Twilio SMS", status: "connected", icon: Smartphone },
    { name: "SendGrid Email", status: "connected", icon: Mail },
    { name: "Slack", status: "not-connected", icon: Bell },
    { name: "Salesforce", status: "not-connected", icon: Users },
    { name: "Zoom", status: "not-connected", icon: Globe },
  ];

  const teamMembers = [
    { name: "Admin User", email: "admin@example.com", role: "Super Admin" },
    { name: "Event Manager", email: "manager@example.com", role: "Host" },
    { name: "Door Staff 1", email: "door1@example.com", role: "Door Staff" },
    { name: "Marketing Lead", email: "marketing@example.com", role: "Marketer" },
  ];

  if (loading) return <div className="p-12 text-center">Loading settings...</div>;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-6xl">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
              <p className="text-muted-foreground">Configure your event and system preferences</p>
            </div>

            <Button variant="hero" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">

            {/* LEFT SIDEBAR NAVIGATION */}
            <div className="lg:col-span-1">
              <nav className="glass rounded-2xl p-4 space-y-1">
                {[
                  { id: "general", label: "General", icon: Building },
                  { id: "features", label: "Features", icon: SettingsIcon },
                  { id: "notifications", label: "Notifications", icon: Bell },
                  { id: "integrations", label: "Integrations", icon: Webhook },
                  { id: "team", label: "Team", icon: Users },
                  { id: "security", label: "Security & GDPR", icon: Shield },
                  { id: "branding", label: "Branding", icon: Palette },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                      activeTab === item.id
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* MAIN CONTENT */}
            <div className="lg:col-span-3">

              {/* GENERAL TAB */}
              {activeTab === "general" && (
                <div className="glass rounded-2xl p-8 space-y-8">

                  <div>
                    <h2 className="text-xl font-semibold text-foreground mb-6">Event Details</h2>

                    <div className="grid md:grid-cols-2 gap-6">

                      <div className="space-y-2">
                        <Label>Event Name</Label>
                        <Input
                          className="h-12"
                          value={settings.eventName}
                          onChange={(e) => setSettings({ ...settings, eventName: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Event Date</Label>
                        <Input
                          type="date"
                          className="h-12"
                          value={settings.eventDate}
                          onChange={(e) => setSettings({ ...settings, eventDate: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Venue</Label>
                        <Input
                          className="h-12"
                          value={settings.venue}
                          onChange={(e) => setSettings({ ...settings, venue: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Timezone</Label>
                        <Select
                          value={settings.timezone}
                          onValueChange={(v) => setSettings({ ...settings, timezone: v })}
                        >
                          <SelectTrigger className="h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/New_York">Eastern Time</SelectItem>
                            <SelectItem value="America/Chicago">Central Time</SelectItem>
                            <SelectItem value="America/Denver">Mountain Time</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                            <SelectItem value="Europe/London">GMT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Venue Capacity</Label>
                        <Input
                          type="number"
                          className="h-12"
                          value={settings.capacity}
                          onChange={(e) => setSettings({ ...settings, capacity: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------------------------------- */}
              {/* THE REST OF YOUR TABS REMAIN UNCHANGED  */}
              {/* ---------------------------------------- */}
              {/* I DID NOT TOUCH ANY UI — ONLY ADDED FIRESTORE */}

              {activeTab === "features" && (
                <div className="glass rounded-2xl p-8 space-y-6">
                  <h2 className="text-xl font-semibold text-foreground mb-6">Feature Settings</h2>

                  <div className="space-y-6">

                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                      <div>
                        <p className="font-medium text-foreground">Skip-the-Line Geofencing</p>
                        <p className="text-sm text-muted-foreground">
                          Notify staff when pre-registered guests approach the venue
                        </p>
                      </div>
                      <Switch
                        checked={settings.enableGeofencing}
                        onCheckedChange={(c) => setSettings({ ...settings, enableGeofencing: c })}
                      />
                    </div>

                    {settings.enableGeofencing && (
                      <div className="pl-4 space-y-2">
                        <Label>Geofence Radius (meters)</Label>
                        <Input
                          type="number"
                          className="h-12 max-w-xs"
                          value={settings.geofenceRadius}
                          onChange={(e) =>
                            setSettings({ ...settings, geofenceRadius: parseInt(e.target.value) })
                          }
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                      <div>
                        <p className="font-medium text-foreground">Offline Mode</p>
                        <p className="text-sm text-muted-foreground">
                          Queue scans locally when internet is unavailable
                        </p>
                      </div>
                      <Switch
                        checked={settings.enableOfflineMode}
                        onCheckedChange={(c) => setSettings({ ...settings, enableOfflineMode: c })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                      <div>
                        <p className="font-medium text-foreground">Badge Printing</p>
                        <p className="text-sm text-muted-foreground">
                          Print name badges on successful check-in
                        </p>
                      </div>
                      <Switch
                        checked={settings.enableBadgePrinting}
                        onCheckedChange={(c) => setSettings({ ...settings, enableBadgePrinting: c })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                      <div>
                        <p className="font-medium text-foreground">Sponsor Footer in SMS</p>
                        <p className="text-sm text-muted-foreground">Enable sponsor messages in SMS campaigns</p>
                      </div>
                      <Switch
                        checked={settings.enableSponsorFooter}
                        onCheckedChange={(c) => setSettings({ ...settings, enableSponsorFooter: c })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications */}
              {activeTab === "notifications" && (
                <div className="glass rounded-2xl p-8 space-y-6">
                  <h2 className="text-xl font-semibold text-foreground mb-6">Notification Preferences</h2>

                  <div className="space-y-4">
                    {[
                      {
                        key: "emailNotifications",
                        label: "Email Notifications",
                        desc: "Receive event updates via email",
                      },
                      {
                        key: "smsNotifications",
                        label: "SMS Notifications",
                        desc: "Receive urgent alerts via SMS",
                      },
                      {
                        key: "capacityAlerts",
                        label: "Capacity Alerts",
                        desc: "Alert when rooms reach 90% capacity",
                      },
                      {
                        key: "vipAlerts",
                        label: "VIP Arrival Alerts",
                        desc: "Notify when VIP guests check in",
                      },
                      {
                        key: "flaggedEntryAlerts",
                        label: "Flagged Entry Alerts",
                        desc: "Alert on flagged or banned entries",
                      },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between p-4 rounded-xl bg-secondary/50"
                      >
                        <div>
                          <p className="font-medium text-foreground">{item.label}</p>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                        <Switch
                          checked={settings[item.key]}
                          onCheckedChange={(c) => setSettings({ ...settings, [item.key]: c })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Integrations */}
              {activeTab === "integrations" && (
                <div className="glass rounded-2xl p-8 space-y-6">
                  <h2 className="text-xl font-semibold text-foreground mb-6">Integrations</h2>

                  <div className="space-y-4">
                    {integrations.map((integration) => (
                      <div
                        key={integration.name}
                        className="flex items-center justify-between p-4 rounded-xl bg-secondary/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                            <integration.icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{integration.name}</p>
                            <p
                              className={`text-sm ${
                                integration.status === "connected"
                                  ? "text-success"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {integration.status === "connected" ? "● Connected" : "Not connected"}
                            </p>
                          </div>
                        </div>

                        <Button
                          variant={integration.status === "connected" ? "outline" : "hero"}
                          size="sm"
                        >
                          {integration.status === "connected" ? "Configure" : "Connect"}
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6 border-t border-border">
                    <h3 className="font-medium text-foreground mb-4">API Access</h3>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Input
                          value="sk_live_************************"
                          readOnly
                          className="font-mono h-12"
                        />
                      </div>
                      <Button variant="outline">
                        <Key className="w-4 h-4 mr-2" />
                        Regenerate
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Team */}
              {activeTab === "team" && (
                <div className="glass rounded-2xl p-8 space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-foreground">Team Members</h2>
                    <Button variant="hero" size="sm">
                      <Users className="w-4 h-4 mr-2" />
                      Invite Member
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {teamMembers.map((member) => (
                      <div
                        key={member.email}
                        className="flex items-center justify-between p-4 rounded-xl bg-secondary/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {member.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{member.name}</p>
                            <p className="text-sm text-muted-foreground">{member.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs ${
                              member.role === "Super Admin"
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {member.role}
                          </span>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Security */}
              {activeTab === "security" && (
                <div className="glass rounded-2xl p-8 space-y-8">

                  <div>
                    <h2 className="text-xl font-semibold text-foreground mb-6">Security & Compliance</h2>

                    <div className="space-y-6">

                      <div className="p-4 rounded-xl bg-success/10 border border-success/30">
                        <div className="flex items-center gap-3">
                          <Check className="w-5 h-5 text-success" />
                          <div>
                            <p className="font-medium text-foreground">GDPR Compliant</p>
                            <p className="text-sm text-muted-foreground">
                              Your event meets GDPR requirements
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                          <div>
                            <p className="font-medium text-foreground">Require Consent</p>
                            <p className="text-sm text-muted-foreground">
                              Guests must agree to terms before registration
                            </p>
                          </div>
                          <Switch
                            checked={settings.requireConsent}
                            onCheckedChange={(c) => setSettings({ ...settings, requireConsent: c })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Data Retention Period (days)</Label>
                          <Select
                            value={settings.dataRetention}
                            onValueChange={(v) => setSettings({ ...settings, dataRetention: v })}
                          >
                            <SelectTrigger className="h-12 max-w-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="30">30 days</SelectItem>
                              <SelectItem value="90">90 days</SelectItem>
                              <SelectItem value="180">180 days</SelectItem>
                              <SelectItem value="365">1 year</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Anonymize Data After (days)</Label>
                          <Select
                            value={settings.anonymizeAfter}
                            onValueChange={(v) => setSettings({ ...settings, anonymizeAfter: v })}
                          >
                            <SelectTrigger className="h-12 max-w-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="90">90 days</SelectItem>
                              <SelectItem value="180">180 days</SelectItem>
                              <SelectItem value="365">1 year</SelectItem>
                              <SelectItem value="730">2 years</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <Button variant="outline">Export All Data</Button>

                        <Button variant="destructive">
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Delete All Data
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Branding */}
              {activeTab === "branding" && (
                <div className="glass rounded-2xl p-8 space-y-6">
                  <h2 className="text-xl font-semibold text-foreground mb-6">Branding</h2>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>Event Logo</Label>
                      <div className="flex items-center gap-4">
                        <div className="w-24 h-24 rounded-xl bg-secondary border-2 border-dashed border-border flex items-center justify-center">
                          <Palette className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <Button variant="outline">Upload Logo</Button>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Primary Color</Label>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-primary" />
                          <Input value="#22d3ee" className="h-12 font-mono" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Accent Color</Label>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-success" />
                          <Input value="#22c55e" className="h-12 font-mono" />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-secondary/50">
                      <p className="text-sm text-muted-foreground">
                        White-label branding is available on Enterprise plans.
                        <a href="#" className="text-primary hover:underline ml-1">
                          Upgrade now
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default Settings;
