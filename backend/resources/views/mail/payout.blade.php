@extends('mail.layout')

@php
    $font = 'Inter,Segoe UI,Helvetica,Arial,sans-serif';
    $mono = 'SFMono-Regular,Menlo,Consolas,Courier New,monospace';
    $paid = $stage === 'paid';
    $rejected = $stage === 'rejected';
    $accent = $paid ? '#19E6CE' : ($rejected ? '#F87171' : '#F8D21F');
    $badge = $paid ? '&#10003;&nbsp; Paid' : ($rejected ? 'Declined' : '&#9203;&nbsp; Request received');
    $rows = array_filter([
        ['Reference', $reference],
        ['Amount', $amount],
        ['To M-Pesa', $phone],
        $requestedAt ? ['Requested', $requestedAt->format('D j M, g:ia')] : null,
        ! $paid && ! $rejected && $dueAt ? ['Expected by', $dueAt->format('D j M, g:ia')] : null,
        $paid && $paidAt ? ['Sent', $paidAt->format('D j M, g:ia')] : null,
        $paid && $payout->mpesa_receipt ? ['M-Pesa receipt', $payout->mpesa_receipt] : null,
        $rejected && $payout->result_desc ? ['Reason', $payout->result_desc] : null,
    ]);
@endphp

@section('title', 'Withdrawal '.$reference)
@section('preheader', $paid ? "{$amount} sent to {$phone}" : ($rejected ? "{$amount} is back in your Tikooh wallet" : "We'll send {$amount} to {$phone}".($dueAt ? ' by '.$dueAt->format('D j M, g:ia') : '')))

@section('content')
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:36px 44px 8px;font-family:{{ $font }};">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="border:1px solid {{ $accent }}55;border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:{{ $accent }};">{!! $badge !!}</td>
    </tr></table>

    <h1 class="tk-hero-title" style="margin:20px 0 0;font-size:40px;line-height:46px;font-weight:800;letter-spacing:-1px;color:#FFFFFF;">{{ $amount }}</h1>
    <p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#AEB9CE;">
      @if($paid)
        Your withdrawal has been sent to <strong style="color:#FFFFFF;">{{ $phone }}</strong>. You should already have the M-Pesa message.
      @elseif($rejected)
        We couldn't send this withdrawal, so the full amount is back in your Tikooh wallet. You can request it again any time.
      @else
        Thanks{{ $org ? ', '.$org : '' }}. We've received your request and will send it to <strong style="color:#FFFFFF;">{{ $phone }}</strong>@if($dueAt) by <strong style="color:#FFFFFF;">{{ $dueAt->format('l, g:ia') }}</strong>@endif.
        The amount is held in your wallet until then.
      @endif
    </p>
  </td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:24px 44px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0E1729" style="background-color:#0E1729;border:1px solid #1C2740;border-radius:16px;">
      @foreach($rows as [$label, $value])
      <tr><td style="padding:{{ $loop->first ? '16px' : '8px' }} 20px {{ $loop->last ? '16px' : '8px' }};font-family:{{ $font }};font-size:14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#8A97B0;">{{ $label }}</td>
          <td align="right" style="color:#FFFFFF;font-weight:600;{{ in_array($label, ['Reference', 'M-Pesa receipt']) ? 'font-family:'.$mono.';' : '' }}">{{ $value }}</td>
        </tr></table>
      </td></tr>
      @endforeach
    </table>
  </td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" align="center" style="padding:28px 44px 40px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td bgcolor="#19E6CE" style="background-color:#19E6CE;background-image:linear-gradient(135deg,#19E6CE 0%,#19A1E6 100%);border-radius:14px;">
        <a href="{{ $walletUrl }}" style="display:inline-block;padding:14px 30px;font-family:{{ $font }};font-size:15px;font-weight:800;color:#05070F;text-decoration:none;">Open your wallet &rarr;</a>
      </td>
    </tr></table>
  </td></tr>
</table>
@endsection

@section('footer_note')
  Sent about withdrawal {{ $reference }}. If you didn't request this, reply to this email right away.
@endsection
