<?php

namespace App\Mail;

use App\Models\Payout;
use App\Services\WalletService;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Tells the organiser where their withdrawal is: requested, paid or declined. */
class PayoutMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Payout $payout, public string $stage) {}

    public function envelope(): Envelope
    {
        $amount = 'KES '.number_format((float) $this->payout->net_amount);

        return new Envelope(subject: match ($this->stage) {
            'paid' => "💸 {$amount} is on its way to your M-Pesa",
            'rejected' => "Your {$amount} withdrawal was declined",
            default => "We've received your {$amount} withdrawal request",
        });
    }

    public function content(): Content
    {
        $tz = 'Africa/Nairobi';

        return new Content(view: 'mail.payout', with: [
            'amount' => 'KES '.number_format((float) $this->payout->net_amount),
            'phone' => WalletService::maskPhone((string) $this->payout->destination_account),
            'reference' => 'WD-'.str_pad((string) $this->payout->id, 5, '0', STR_PAD_LEFT),
            'requestedAt' => $this->payout->created_at?->copy()->timezone($tz),
            'dueAt' => $this->payout->due_at?->copy()->timezone($tz),
            'paidAt' => $this->payout->paid_at?->copy()->timezone($tz),
            'org' => $this->payout->tenant?->organization_name,
            'walletUrl' => rtrim((string) config('app.frontend_url'), '/').'/payouts',
        ]);
    }
}
