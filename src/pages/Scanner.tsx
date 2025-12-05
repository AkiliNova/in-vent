import { useState, useEffect } from 'react';
import { 
  Camera, 
  Check, 
  X, 
  AlertTriangle, 
  Wifi, 
  WifiOff,
  Volume2,
  Crown,
  Printer,
  RotateCcw,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import Navigation from '@/components/Navigation';
import { db } from '@/firebase/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

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
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [recentScans, setRecentScans] = useState<ScanResult[]>([]);

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

  // Firestore ticket validation
  const validateTicket = async (ticketId: string) => {
    setStatus('scanning');
    try {
      const ticketRef = doc(db, 'guests', ticketId);
      const ticketSnap = await getDoc(ticketRef);

      if (!ticketSnap.exists()) {
        setScanResult({
          name: 'Unknown Ticket',
          email: '',
          ticketType: '',
          isVIP: false,
          isFlagged: false,
          flagReason: 'Ticket not found',
        });
        setStatus('flagged');
        return;
      }

      const data = ticketSnap.data() as any;

      if (data.checkedIn) {
        setScanResult({
          name: `${data.firstName} ${data.lastName}`,
          email: data.email,
          ticketType: data.guestCategory || 'General',
          isVIP: data.guestCategory === 'VIP',
          alreadyCheckedIn: true,
          checkInTime: data.checkInTime || '',
          isFlagged: false,
        });
        setStatus('error');
        return;
      }

      // Mark ticket as checked in
      await updateDoc(ticketRef, {
        checkedIn: true,
        checkInTime: new Date().toLocaleTimeString(),
      });

      const result: ScanResult = {
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        ticketType: data.guestCategory || 'General',
        isVIP: data.guestCategory === 'VIP',
        isFlagged: false,
      };

      setScanResult(result);
      setStatus('success');
      setScanCount(prev => prev + 1);
      setRecentScans(prev => [result, ...prev.slice(0, 4)]);

      toast({
        title: "Check-in Successful",
        description: `${result.name} has been checked in.`,
      });
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

  const handleScanClick = async () => {
    const ticketId = prompt("Enter scanned ticket ID:");
    if (!ticketId) return;
    await validateTicket(ticketId);
  };

  const resetScan = () => {
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
                {isOnline ? 'Online' : 'Offline Mode'}
              </div>
              <Button variant="outline" size="icon">
                <Volume2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Scanner View */}
            <div className="space-y-6">
              <div className={`relative aspect-square rounded-3xl border-4 transition-all duration-300 ${getStatusColor()}`}>
                <div className="absolute inset-8 border-2 border-dashed border-muted-foreground/30 rounded-2xl" />
                <div className="absolute top-6 left-6 w-12 h-12 border-l-4 border-t-4 border-primary rounded-tl-lg" />
                <div className="absolute top-6 right-6 w-12 h-12 border-r-4 border-t-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-6 left-6 w-12 h-12 border-l-4 border-b-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-6 right-6 w-12 h-12 border-r-4 border-b-4 border-primary rounded-br-lg" />

                {/* Status Display */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {status === 'idle' && (
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Position QR code in frame</p>
                    </div>
                  )}
                  {status === 'scanning' && (
                    <div className="text-center">
                      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-primary">Scanning...</p>
                    </div>
                  )}
                  {status === 'success' && scanResult && (
                    <div className="text-center animate-scale-in">
                      <div className="w-20 h-20 rounded-full bg-success flex items-center justify-center mx-auto mb-4">
                        <Check className="w-10 h-10 text-success-foreground" />
                      </div>
                      <p className="text-2xl font-bold text-foreground mb-1">{scanResult.name}</p>
                      <div className="flex items-center justify-center gap-2">
                        {scanResult.isVIP && <Crown className="w-5 h-5 text-yellow-500" />}
                        <span className={`px-3 py-1 rounded-full text-sm ${scanResult.isVIP ? 'bg-yellow-500/20 text-yellow-500' : 'bg-primary/20 text-primary'}`}>
                          {scanResult.ticketType}
                        </span>
                      </div>
                    </div>
                  )}
                  {status === 'error' && scanResult && (
                    <div className="text-center animate-scale-in">
                      <div className="w-20 h-20 rounded-full bg-destructive flex items-center justify-center mx-auto mb-4">
                        <X className="w-10 h-10 text-destructive-foreground" />
                      </div>
                      <p className="text-xl font-bold text-foreground mb-1">Already Checked In</p>
                      <p className="text-muted-foreground">{scanResult.name}</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Checked in at {scanResult.checkInTime}
                      </p>
                    </div>
                  )}
                  {status === 'flagged' && scanResult && (
                    <div className="text-center animate-scale-in">
                      <div className="w-20 h-20 rounded-full bg-yellow-500 flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-10 h-10 text-yellow-950" />
                      </div>
                      <p className="text-xl font-bold text-foreground mb-1">FLAGGED</p>
                      <p className="text-yellow-500 font-medium">{scanResult.flagReason}</p>
                    </div>
                  )}
                </div>
                {status === 'scanning' && (
                  <div className="absolute left-8 right-8 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-bounce" />
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                {status === 'idle' || status === 'scanning' ? (
                  <Button 
                    variant="hero" 
                    size="xl" 
                    className="flex-1"
                    onClick={handleScanClick}
                    disabled={status === 'scanning'}
                  >
                    <Camera className="w-5 h-5" />
                    {status === 'scanning' ? 'Scanning...' : 'Scan QR Code'}
                  </Button>
                ) : (
                  <>
                    <Button 
                      variant="heroOutline" 
                      size="xl" 
                      className="flex-1"
                      onClick={resetScan}
                    >
                      <RotateCcw className="w-5 h-5" />
                      Scan Next
                    </Button>
                    {status === 'success' && (
                      <Button 
                        variant="hero" 
                        size="xl" 
                        className="flex-1"
                      >
                        <Printer className="w-5 h-5" />
                        Print Badge
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Stats & Recent */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass rounded-2xl p-6 text-center">
                  <div className="text-4xl font-bold gradient-text mb-1">{scanCount}</div>
                  <div className="text-sm text-muted-foreground">Checked In</div>
                </div>
                <div className="glass rounded-2xl p-6 text-center">
                  <div className="text-4xl font-bold text-foreground mb-1">—</div>
                  <div className="text-sm text-muted-foreground">Avg Time</div>
                </div>
              </div>

              {!isOnline && (
                <div className="glass rounded-2xl p-4 border-yellow-500/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                      <WifiOff className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Offline Mode Active</p>
                      <p className="text-sm text-muted-foreground">Queued scans will sync when online</p>
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
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{scan.name}</p>
                          <p className="text-xs text-muted-foreground">{scan.ticketType}</p>
                        </div>
                        <Check className="w-5 h-5 text-success" />
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.location.href = '/register'}
              >
                Manual Entry (No QR)
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Scanner;
