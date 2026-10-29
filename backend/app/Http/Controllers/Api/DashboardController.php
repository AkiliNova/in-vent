<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendee;
use App\Models\CheckIn;
use App\Models\Event;
use App\Models\FeedbackResponse;
use App\Models\Lead;
use App\Models\Order;
use App\Models\Tenant;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Tikooh's "comprehensive event analytics". These are the aggregate queries
 * that were impractical on Firestore.
 */
class DashboardController extends Controller
{
    /** Tenant-wide overview. */
    public function overview(Request $request): JsonResponse
    {
        $from = $request->date('from') ?? now()->subYear();

        return response()->json([
            'events' => [
                'total' => Event::count(),
                'published' => Event::published()->count(),
                'upcoming' => Event::published()->upcoming()->count(),
            ],
            'attendees' => [
                'total' => Attendee::count(),
                'checked_in' => Attendee::checkedIn()->count(),
            ],
            'revenue' => [
                'gross' => (float) Order::where('status', 'paid')->where('paid_at', '>=', $from)->sum('total'),
                'orders' => Order::where('status', 'paid')->where('paid_at', '>=', $from)->count(),
                'by_month' => Order::query()
                    ->where('status', 'paid')
                    ->where('paid_at', '>=', $from)
                    ->selectRaw(
                        self::dateGroup('paid_at', '%Y-%m').' as month, SUM(total) as revenue, COUNT(*) as orders'
                    )
                    ->groupBy('month')
                    ->orderBy('month')
                    ->get(),
            ],
            'upcoming_events' => Event::published()
                ->upcoming()
                ->withCount('attendees')
                ->orderBy('start_date')
                ->limit(5)
                ->get(['id', 'uuid', 'title', 'start_date', 'location_name']),
        ]);
    }

    /** Full report for one event — the post-event readout. */
    public function event(Event $event): JsonResponse
    {
        $registered = $event->attendees()->whereNot('status', 'cancelled')->count();
        $checkedIn = $event->attendees()->whereNotNull('checked_in_at')->count();

        return response()->json([
            'registration' => [
                'registered' => $registered,
                'checked_in' => $checkedIn,
                'no_show' => max(0, $registered - $checkedIn),
                'attendance_rate' => $registered > 0 ? round($checkedIn / $registered * 100, 1) : 0.0,
                'waitlist' => $event->waitlistEntries()->where('status', 'waiting')->count(),
                'by_category' => $event->attendees()
                    ->selectRaw('category, COUNT(*) as total')
                    ->groupBy('category')
                    ->pluck('total', 'category'),
            ],
            'revenue' => [
                'gross' => (float) $event->orders()->where('status', 'paid')->sum('total'),
                'discounts' => (float) $event->orders()->where('status', 'paid')->sum('discount_amount'),
                'orders' => $event->orders()->where('status', 'paid')->count(),
                'abandoned' => $event->orders()->whereIn('status', ['pending', 'expired'])->count(),
                'by_tier' => $event->ticketTiers()
                    ->get(['name', 'price', 'capacity', 'sold'])
                    ->map(fn ($t) => [
                        'name' => $t->name,
                        'sold' => $t->sold,
                        'capacity' => $t->capacity,
                        'revenue' => round($t->sold * (float) $t->price, 2),
                        'sell_through' => $t->capacity > 0 ? round($t->sold / $t->capacity * 100, 1) : null,
                    ]),
            ],
            'arrivals_by_hour' => CheckIn::query()
                ->where('event_id', $event->id)
                ->accepted()
                ->inbound()
                ->selectRaw(
                    self::dateGroup('scanned_at', '%Y-%m-%d %H:00').' as hour, COUNT(*) as total'
                )
                ->groupBy('hour')
                ->orderBy('hour')
                ->get(),
            'sessions' => $event->sessions()
                ->withCount([
                    'attendees as attended_count' => fn ($q) => $q->whereNotNull('event_session_attendee.attended_at'),
                ])
                ->withAvg('feedbackResponses as average_rating', 'overall_rating')
                ->get(['id', 'title', 'starts_at', 'capacity'])
                ->map(fn ($s) => [
                    'title' => $s->title,
                    'starts_at' => $s->starts_at,
                    'attended' => $s->attended_count,
                    'capacity' => $s->capacity,
                    'rating' => $s->average_rating ? round((float) $s->average_rating, 2) : null,
                ]),
            'speakers' => $event->speakers()
                ->whereNotNull('average_rating')
                ->orderByDesc('average_rating')
                ->get(['name', 'company', 'average_rating']),
            'feedback' => [
                'responses' => FeedbackResponse::where('event_id', $event->id)->count(),
                'average_rating' => round(
                    (float) FeedbackResponse::where('event_id', $event->id)->avg('overall_rating'),
                    2
                ),
                'nps' => $this->nps($event),
            ],
            'exhibitors' => [
                'total' => $event->exhibitors()->count(),
                'booths_assigned' => $event->booths()->where('status', 'assigned')->count(),
                'leads_captured' => Lead::where('event_id', $event->id)->count(),
                'top' => Lead::query()
                    ->where('event_id', $event->id)
                    ->selectRaw('exhibitor_id, COUNT(*) as leads')
                    ->groupBy('exhibitor_id')
                    ->orderByDesc('leads')
                    ->with('exhibitor:id,company_name')
                    ->limit(10)
                    ->get(),
            ],
            'engagement' => [
                'polls_run' => $event->polls()->whereNot('status', 'draft')->count(),
                'votes_cast' => (int) $event->polls()->sum('total_votes'),
                'questions_asked' => $event->questions()->count(),
                'questions_answered' => $event->questions()->where('status', 'answered')->count(),
                'connections_made' => $event->connections()->accepted()->count(),
                'meetings_booked' => $event->meetings()->where('status', 'confirmed')->count(),
            ],
        ]);
    }

    /** Platform-wide numbers for the super admin. */
    public function platform(): JsonResponse
    {
        return TenantContext::withoutScoping(fn () => response()->json([
            'tenants' => Tenant::count(),
            'suspended' => Tenant::where('suspended', true)->count(),
            'events' => Event::withoutGlobalScope('tenant')->count(),
            'attendees' => Attendee::withoutGlobalScope('tenant')->count(),
            'gross_volume' => (float) Order::withoutGlobalScope('tenant')->where('status', 'paid')->sum('total'),
            'top_tenants' => Tenant::query()
                ->withCount('events')
                ->withSum(['payouts as payout_total' => fn ($q) => $q->where('status', 'paid')], 'net_amount')
                ->orderByDesc('events_count')
                ->limit(10)
                ->get(['id', 'organization_name', 'package', 'suspended']),
        ]));
    }

    /**
     * A date-truncation expression for the current driver.
     *
     * MySQL and SQLite spell this differently and neither understands the
     * other's function, so the expression is chosen once rather than layered
     * with `selectRaw`, which appends instead of replacing.
     *
     * @param  string  $format  A MySQL DATE_FORMAT pattern; strftime uses the same tokens here.
     */
    protected static function dateGroup(string $column, string $format): string
    {
        return match (DB::connection()->getDriverName()) {
            'sqlite' => "strftime('{$format}', {$column})",
            'pgsql' => "to_char({$column}, '".str_replace(['%Y', '%m', '%d', '%H'], ['YYYY', 'MM', 'DD', 'HH24'], $format)."')",
            default => "DATE_FORMAT({$column}, '{$format}')",
        };
    }

    protected function nps(Event $event): ?float
    {
        $scores = FeedbackResponse::where('event_id', $event->id)
            ->whereNotNull('nps_score')
            ->pluck('nps_score');

        if ($scores->isEmpty()) {
            return null;
        }

        $promoters = $scores->filter(fn ($s) => $s >= 9)->count();
        $detractors = $scores->filter(fn ($s) => $s <= 6)->count();

        return round(($promoters - $detractors) / $scores->count() * 100, 1);
    }
}
