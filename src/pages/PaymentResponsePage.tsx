"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navigation from "@/components/Navigation";
import { toast } from "@/hooks/use-toast";
import { db } from "@/firebase/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

interface TransactionStatus {
  status: string;
  amount?: number;
  currency?: string;
  description?: string;
  orderReference?: string;
}

export default function PaymentResponsePage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<TransactionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const orderTrackingId = searchParams.get("OrderTrackingId");
  const orderReference = searchParams.get("OrderMerchantReference");

  useEffect(() => {
    if (!orderTrackingId || !orderReference) {
      toast({ title: "Invalid payment response", variant: "destructive" });
      setLoading(false);
      return;
    }

    const fetchTransactionStatus = async () => {
      try {
        const res = await fetch(
          `https://tikooh.akilinova.tech/payment/verify_payment.php?orderTrackingId=${orderTrackingId}`
        );
        const data = await res.json();

        if (!res.ok) throw new Error(data.message || "Failed to verify payment");

        const transaction: TransactionStatus = {
          status: data.status,
          amount: data.amount,
          currency: data.currency,
          description: data.description,
          orderReference,
        };

        setStatus(transaction);

        // Save ticket in Firestore if payment succeeded
        if (data.status === "COMPLETED") {
          await setDoc(doc(db, "tickets", orderReference), {
            orderReference,
            orderTrackingId,
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            createdAt: serverTimestamp(),
          });
          toast({ title: "Ticket created successfully!" });
        }

      } catch (err: any) {
        console.error(err);
        toast({
          title: "Payment verification failed",
          description: err.message,
          variant: "destructive",
        });
        setStatus({ status: "FAILED" });
      } finally {
        setLoading(false);
      }
    };

    fetchTransactionStatus();
  }, [orderTrackingId, orderReference]);

  if (loading) return <p className="text-center mt-24">Verifying payment...</p>;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 px-6 container mx-auto max-w-md text-center">
        {status?.status === "200" ? (
          <div className="p-6 border rounded-xl shadow-sm">
            <h2 className="text-2xl font-bold mb-4">Payment Successful!</h2>
            <p className="mb-2"><strong>Order Reference:</strong> {status.orderReference}</p>
            <p className="mb-2"><strong>Amount Paid:</strong> {status.currency} {status.amount}</p>
            <p className="mb-2"><strong>Description:</strong> {status.description}</p>
            <p className="mt-4 font-semibold">Your ticket has been successfully booked.</p>
            <Button className="mt-6 w-full" onClick={() => window.location.href = "/"}>
              Go to Home
            </Button>
          </div>
        ) : (
          <div className="p-6 border rounded-xl shadow-sm">
            <h2 className="text-2xl font-bold mb-4">Payment Failed</h2>
            <p className="mb-2"><strong>Order Reference:</strong> {status?.orderReference || "N/A"}</p>
            <p className="mt-4 font-semibold">There was an issue processing your payment. Please try again.</p>
            <Button className="mt-6 w-full" onClick={() => window.location.href = "/"}>
              Go to Home
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
