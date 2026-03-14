"use client";

import { useState, useEffect, useRef } from 'react';
import {
  Camera, Check, X, AlertTriangle, Wifi, WifiOff,
  Volume2, Crown, Printer, RotateCcw, User, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import Navigation from '@/components/Navigation';
import { db } from '@/firebase/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { Html5Qrcode } from 'html5-qrcode';

type ScanStatus = 'idle' | 'scanning' | 'success' | 'error' | 'flagged';

interface ScanResult {
  name: string;
  email: string;
  ticketType: string;
  isVIP: boolean;
  isFlagged: boolean;
  flagReason?: string;
  checkInTime?: string;
  alreadyCheckedIn?: boolean;
}

const Scanner = () => {
  const { tenantId } = useAuth();
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [recentScans, setRecentScans] = useState<ScanResult[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = 'qr-reader';

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (_) {}
      scannerRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    if (cameraActive) {
      await stopCamera();
      return;
    }

    try {
      const html5QrCode = new Html5Qrcode(scannerDivId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // Extract ticketId from format "ticket:ID" or raw ID
          const ticketId = decodedText.startsWith('ticket:')
            ? decodedText.replace('ticket:', '')
            : decodedText;

          await stopCamera();
          await validateTicket(ticketId);
        },
        () => {} // ignore scan errors (frame by frame)
      );

      setCameraActive(true);
      setStatus('scanning');
    } catch (err: any) {
      toast({
        title: 'Camera Error',
        description: err.message || 'Could not access camera.',
        variant: 'destructive',
      });
    }
  };

  // Validate ticket
  const validateTicket = async (ticketId: string) => {
    if (!tenantId) {
      toast({ title: 'Tenant Missing', description: 'Cannot check in without a tenant.', variant: 'destructive' });
      return;
    }

    setStatus('scanning');
    try {
      const ticketRef = doc(db, `tenants/${tenantId}/guests`, ticketId);
      const ticketSnap = await getDoc(ticketRef);

      if (!ticketSnap.exists()) {
        setScanResult({
          name: 'Unknown Ticket',
          email: '',
          ticketType: '',
          isVIP: false,
          isFlagged: false,
          flagReason: 'Ticket not found in system',
        });
        setStatus('flagged');
        return;
      }

      const data = ticketSnap.data() as any;

      if (data.status === 'checked-in') {
        const checkedAt = data.checkedInAt
          ? new Date(data.checkedInAt).toLocaleTimeString()
          : 'Unknown time';
        setScanResult({
          name: `${data.firstName} ${data.lastName}`,
          email: data.email,
          ticketType: data.ticketTier || data.guestCategory || 'General',
          isVIP: data.guestCategory === 'VIP' || data.ticketTier === 'VIP',
          alreadyCheckedIn: true,
          checkInTime: checkedAt,
          isFlagged: false,
        });
        setStatus('error');
        return;
      }

      const now = new Date().toISOString();
      await updateDoc(ticketRef, {
        status: 'checked-in',
        checkedInAt: now,
      });

      const result: ScanResult = {
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        ticketType: data.ticketTier || data.guestCategory || 'General',
        isVIP: data.guestCategory === 'VIP' || data.ticketTier === 'VIP',
        isFlagged: false,
        checkInTime: new Date(now).toLocaleTimeString(),
      };

      setScanResult(result);
      setStatus('success');
      setScanCount(prev => prev + 1);
      setRecentScans(prev => [result, ...prev.slice(0, 4)]);

      toast({ title: 'Check-in Successful', description: `${result.name} checked in.` });
    } catch (error: any) {
      console.error(error);
      setScanResult({
        name: 'Error',
        email: '',
        ticketType: '',
        isVIP: false,
        isFlagged: false,
        flagReason: error.message,
      });
      setStatus('flagged');
    }
  };

  const handleManualSubmit = async () => {
    if (!manualId.trim()) return;
    setShowManual(false);
    await validateTicket(manualId.trim());
    setManualId('');
  };

  const resetScan = async () => {
    setStatus('idle');
    setScanResult(null);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success': return 'border-success bg-success/10';
      case 'error': return 'border-destructive bg-destructive/10';
      case 'flagged': return 'border-yellow-500 bg-yellow-500/10';
      case 'scanning': return 'border-primary bg-primary/10 animate-pulse';
      default: return 'border-border bg-card';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-4xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Check-In Scanner</h1>
              <p className="text-muted-foreground">Scan QR codes for instant check-in</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${isOnline ? 'bg-success/20 text-success' : 'bg-yellow-500/20 text-yellow-500'}`}>
                {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                {isOnline ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Scanner View */}
            <div className="space-y-6">
              {/* Camera or status display */}
              <div className={`relative rounded-3xl border-4 transition-all duration-300 overflow-hidden ${getStatusColor()} ${cameraActive ? '' : 'aspect-square'}`}>

                {/* QR Reader div — always mounted but hidden when not active */}
                <div
                  id={scannerDivId}
                  className={`w-full ${cameraActive ? 'block' : 'hidden'}`}
                  style={{ minHeight: cameraActive ? '300px' : '0' }}
                />

                {/* Corner guides (only when not camera) */}
                {!cameraActive && (
                  <>
                    <div className="absolute inset-8 border-2 border-dashed border-muted-foreground/30 rounded-2xl" />
                    <div className="absolute top-6 left-6 w-12 h-12 border-l-4 border-t-4 border-primary rounded-tl-lg" />
                    <div className="absolute top-6 right-6 w-12 h-12 border-r-4 border-t-4 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-6 left-6 w-12 h-12 border-l-4 border-b-4 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-6 right-6 w-12 h-12 border-r-4 border-b-4 border-primary rounded-br-lg" />
                  </>
                )}

                {/* Status content overlay (only when camera is off) */}
                {!cameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {status === 'idle' && (
                      <div className="text-center">
                        <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">Tap "Start Camera" to scan</p>
                      </div>
                    )}
                    {status === 'scanning' && (
                      <div className="text-center">
                        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-primary">Verifying...</p>
                      </div>
                    )}
                    {status === 'success' && scanResult && (
                      <div className="text-center animate-scale-in p-6">
                        <div className="w-20 h-20 rounded-full bg-success flex items-center justify-center mx-auto mb-4">
                          <Check className="w-10 h-10 text-success-foreground" />
                        </div>
                        <p className="text-2xl font-bold text-foreground mb-1">{scanResult.name}</p>
                        <p className="text-sm text-muted-foreground mb-2">{scanResult.email}</p>
                        <div className="flex items-center justify-center gap-2">
                          {scanResult.isVIP && <Crown className="w-5 h-5 text-yellow-500" />}
                          <span className={`px-3 py-1 rounded-full text-sm ${scanResult.isVIP ? 'bg-yellow-500/20 text-yellow-500' : 'bg-primary/20 text-primary'}`}>
                            {scanResult.ticketType}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Checked in at {scanResult.checkInTime}</p>
                      </div>
                    )}
                    {status === 'error' && scanResult && (
                      <div className="text-center animate-scale-in p-6">
                        <div className="w-20 h-20 rounded-full bg-destructive flex items-center justify-center mx-auto mb-4">
                          <X className="w-10 h-10 text-destructive-foreground" />
                        </div>
                        <p className="text-xl font-bold text-foreground mb-1">Already Checked In</p>
                        <p className="text-muted-foreground">{scanResult.name}</p>
                        <p className="text-sm text-muted-foreground mt-2">At {scanResult.checkInTime}</p>
                      </div>
                    )}
                    {status === 'flagged' && scanResult && (
                      <div className="text-center animate-scale-in p-6">
                        <div className="w-20 h-20 rounded-full bg-yellow-500 flex items-center justify-center mx-auto mb-4">
                          <AlertTriangle className="w-10 h-10 text-yellow-950" />
                        </div>
                        <p className="text-xl font-bold text-foreground mb-1">FLAGGED</p>
                        <p className="text-yellow-500 font-medium">{scanResult.flagReason}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 flex-wrap">
                {(status === 'idle' || cameraActive) ? (
                  <Button
                    variant="hero"
                    size="xl"
                    className="flex-1"
                    onClick={startCamera}
                  >
                    <Camera className="w-5 h-5" />
                    {cameraActive ? 'Stop Camera' : 'Start Camera'}
                  </Button>
                ) : (
                  <>
                    <Button variant="heroOutline" size="xl" className="flex-1" onClick={resetScan}>
                      <RotateCcw className="w-5 h-5" />
                      Scan Next
                    </Button>
                    {status === 'success' && (
                      <Button variant="hero" size="xl" className="flex-1" onClick={() => window.print()}>
                        <Printer className="w-5 h-5" />
                        Print Badge
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Manual entry */}
              {!showManual ? (
                <Button variant="outline" className="w-full" onClick={() => setShowManual(true)}>
                  <Search className="w-4 h-4 mr-2" />
                  Manual Ticket ID Entry
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter Ticket ID..."
                    value={manualId}
                    onChange={e => setManualId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                    autoFocus
                  />
                  <Button variant="hero" onClick={handleManualSubmit}>Check In</Button>
                  <Button variant="outline" onClick={() => { setShowManual(false); setManualId(''); }}>Cancel</Button>
                </div>
              )}
            </div>

            {/* Stats & Recent */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass rounded-2xl p-6 text-center">
                  <div className="text-4xl font-bold gradient-text mb-1">{scanCount}</div>
                  <div className="text-sm text-muted-foreground">Checked In Today</div>
                </div>
                <div className="glass rounded-2xl p-6 text-center">
                  <div className="text-4xl font-bold text-foreground mb-1">{recentScans.length}</div>
                  <div className="text-sm text-muted-foreground">Recent Scans</div>
                </div>
              </div>

              {!isOnline && (
                <div className="glass rounded-2xl p-4 border border-yellow-500/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                      <WifiOff className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Offline Mode</p>
                      <p className="text-sm text-muted-foreground">Scans will sync when back online</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Recent Check-ins</h2>
                <div className="space-y-3">
                  {recentScans.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No recent scans</p>
                  ) : (
                    recentScans.map((scan, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                        <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                          {scan.isVIP ? <Crown className="w-5 h-5 text-yellow-500" /> : <User className="w-5 h-5 text-success" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{scan.name}</p>
                          <p className="text-xs text-muted-foreground">{scan.ticketType} · {scan.checkInTime}</p>
                        </div>
                        <Check className="w-5 h-5 text-success flex-shrink-0" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Scanner;
