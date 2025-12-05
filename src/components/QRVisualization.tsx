import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const QRVisualization = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsScanning(true);
      setTimeout(() => {
        setIsVerified(true);
        setTimeout(() => {
          setIsScanning(false);
          setIsVerified(false);
        }, 2000);
      }, 1500);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-64 h-64 mx-auto">
      {/* Glow background */}
      <div className={`absolute inset-0 rounded-3xl transition-all duration-500 ${
        isVerified 
          ? 'bg-success/20 shadow-[0_0_60px_hsl(var(--success)/0.4)]' 
          : isScanning 
            ? 'bg-primary/20 shadow-[0_0_60px_hsl(var(--primary)/0.4)]' 
            : 'bg-card'
      }`} />
      
      {/* QR Code Container */}
      <div className={`relative z-10 w-full h-full rounded-3xl border-2 transition-all duration-300 ${
        isVerified 
          ? 'border-success' 
          : isScanning 
            ? 'border-primary animate-pulse' 
            : 'border-border'
      } bg-card/80 backdrop-blur-sm p-6 flex items-center justify-center`}>
        
        {isVerified ? (
          <div className="flex flex-col items-center gap-4 animate-scale-in">
            <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="w-10 h-10 text-success" />
            </div>
            <span className="text-success font-semibold text-lg">Verified!</span>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 49 }).map((_, i) => {
              const isCorner = 
                (i < 3 || (i >= 4 && i < 7)) && (i % 7 < 3 || i % 7 >= 4) ||
                (i >= 42 && i < 45) && (i % 7 < 3) ||
                (i >= 0 && i < 3 && i % 7 >= 4);
              
              const shouldFill = Math.random() > 0.4 || isCorner;
              
              return (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-sm transition-all duration-300 ${
                    shouldFill 
                      ? isScanning 
                        ? 'bg-primary' 
                        : 'bg-foreground/80' 
                      : 'bg-transparent'
                  }`}
                  style={{
                    animationDelay: isScanning ? `${i * 20}ms` : '0ms',
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Scanning line */}
      {isScanning && !isVerified && (
        <div className="absolute inset-x-6 top-6 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-bounce z-20 rounded-full" />
      )}
    </div>
  );
};

export default QRVisualization;
