<x-mail::message>
# You're going to {{ $event->title }}

Hi {{ explode(' ', $order->buyer_name)[0] }},

Your booking is confirmed. Here are the details:

**When:** {{ $event->start_date->format('l j F Y, g:ia') }}
**Where:** {{ $event->venue?->name ?? $event->location_name ?? 'To be announced' }}{{ $event->city ? ', '.$event->city : '' }}
**Reference:** {{ $order->reference }}

<x-mail::table>
| Ticket | Qty | Price |
|:-------|:---:|------:|
@foreach($order->items as $item)
| {{ $item->tier_name }} | {{ $item->quantity }} | {{ $order->currency }} {{ number_format($item->subtotal, 2) }} |
@endforeach
@if($order->discount_amount > 0)
| Discount | | −{{ $order->currency }} {{ number_format($order->discount_amount, 2) }} |
@endif
| **Total** | | **{{ $order->currency }} {{ number_format($order->total, 2) }}** |
</x-mail::table>

## Your entry codes

Show one of these at the gate — we'll scan it and print your badge.

@foreach($tickets as $ticket)
- **{{ $ticket->code }}**
@endforeach

@if($event->location_map_link)
<x-mail::button :url="$event->location_map_link">
Get directions
</x-mail::button>
@endif

See you there,
{{ $event->host ?: config('app.name') }}
</x-mail::message>
