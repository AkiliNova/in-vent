{{--
    One badge face. Every element is absolutely positioned in millimetres so the
    layout the designer produces in the browser lands on the same spot on paper.
--}}
<div class="badge" style="
    width: {{ $widthMm }}mm;
    height: {{ $heightMm }}mm;
    background-color: {{ $background }};
    @if($backgroundImage) background-image: url('{{ $backgroundImage }}'); background-size: cover; @endif
">
    @foreach($elements as $el)
        @php
            $x = $el['x'] ?? 0;
            $y = $el['y'] ?? 0;
            $w = $el['width'] ?? null;
            $align = $el['align'] ?? 'left';
            $colour = $el['colour'] ?? '#111827';
            $size = $el['fontSize'] ?? 12;
            $weight = $el['fontWeight'] ?? 'normal';
            $bg = $el['background'] ?? null;

            // Field elements bind to a dotted path on the attendee / event / ticket.
            $value = match ($el['type']) {
                'field' => (string) (data_get([
                    'attendee' => $attendee,
                    'event' => $event,
                    'ticket' => ['code' => $badge->qr_payload],
                ], $el['source'] ?? '') ?? ''),
                'text' => $el['text'] ?? '',
                default => '',
            };
        @endphp

        @if($el['type'] === 'qr')
            <img src="{{ $qrDataUri }}" style="
                position: absolute;
                left: {{ $x }}mm; top: {{ $y }}mm;
                width: {{ $el['size'] ?? 36 }}mm; height: {{ $el['size'] ?? 36 }}mm;
            ">
        @elseif($el['type'] === 'image' && ! empty($el['dataUri']))
            <img src="{{ $el['dataUri'] }}" style="
                position: absolute;
                left: {{ $x }}mm; top: {{ $y }}mm;
                @if($w) width: {{ $w }}mm; @endif
                @if(! empty($el['height'])) height: {{ $el['height'] }}mm; @endif
            ">
        @elseif($el['type'] === 'rect')
            <div style="
                position: absolute;
                left: {{ $x }}mm; top: {{ $y }}mm;
                width: {{ $w ?? 10 }}mm; height: {{ $el['height'] ?? 10 }}mm;
                background-color: {{ $el['fill'] ?? '#E5E7EB' }};
            "></div>
        @elseif($value !== '')
            <div style="
                position: absolute;
                left: {{ $x }}mm; top: {{ $y }}mm;
                @if($w) width: {{ $w }}mm; @endif
                font-size: {{ $size }}pt;
                font-weight: {{ $weight }};
                color: {{ $colour }};
                text-align: {{ $align }};
                @if($bg) background-color: {{ $bg }}; padding: 1.5mm 0; @endif
            ">{{ $value }}</div>
        @endif
    @endforeach
</div>
