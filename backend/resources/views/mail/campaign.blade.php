<x-mail::message>
@if($imagePath)
![]({{ \Illuminate\Support\Facades\Storage::url($imagePath) }})
@endif

{!! nl2br(e($body)) !!}
</x-mail::message>
