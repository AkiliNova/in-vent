<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\CampaignMail;
use App\Mail\TicketConfirmation;
use App\Models\Attendee;
use App\Models\Event;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Ticket;
use App\Models\TicketTier;
use App\Services\Notify\Telegram;
use App\Services\Sms\Sms;
use App\Support\PlatformSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Super admin: platform settings, provider credentials and message templates. */
class AdminSettingsController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['groups' => PlatformSettings::describe()]);
    }

    public function update(Request $request): JsonResponse
    {
        $fields = PlatformSettings::fields();

        $data = $request->validate([
            'values' => ['array'],
            'reset' => ['array'],
            'reset.*' => ['string', Rule::in(array_keys($fields))],
        ]);

        $values = array_intersect_key($data['values'] ?? [], $fields);
        $errors = [];

        foreach ($values as $key => $value) {
            $f = $fields[$key];

            if ($value === null || $value === '') {
                continue;
            }

            $error = match ($f['type']) {
                'number' => ! is_numeric($value) ? 'Must be a number.'
                    : ((isset($f['min']) && $value < $f['min']) || (isset($f['max']) && $value > $f['max'])
                        ? "Must be between {$f['min']} and ".($f['max'] ?? '∞').'.' : null),
                'email' => filter_var($value, FILTER_VALIDATE_EMAIL) ? null : 'Must be an email address.',
                'select' => array_key_exists((string) $value, $f['options']) ? null : 'Not a valid choice.',
                default => is_scalar($value) && mb_strlen((string) $value) <= 2000 ? null : 'Too long.',
            };

            if ($error) {
                $errors["values.{$key}"] = $error;
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        PlatformSettings::save($values, $data['reset'] ?? [], $request->user()->id);
        PlatformSettings::apply();

        // Queue workers read settings once at start; make them pick these up.
        Artisan::call('queue:restart');

        return response()->json(['groups' => PlatformSettings::describe(), 'message' => 'Settings saved.']);
    }

    /** Proves a channel works with the current settings, end to end. */
    public function test(Request $request, string $channel): JsonResponse
    {
        $user = $request->user();

        try {
            switch ($channel) {
                case 'email':
                    Mail::raw("This is a test from Tikooh settings.\n\nIf you're reading this, email sending works.", fn ($m) => $m
                        ->to($user->email)->subject('Tikooh test email'));

                    return response()->json(['message' => config('mail.default') === 'log'
                        ? 'Email sending is Off: the test was written to the log, not sent.'
                        : "Test email sent to {$user->email}."]);

                case 'sms':
                    $data = $request->validate(['to' => ['required', 'string', 'max:20']]);
                    $result = Sms::client()->about('test')->send([$data['to']], 'Tikooh test SMS: your SMS settings work.');

                    if ($result['sent'] < 1) {
                        return response()->json(['message' => 'Not sent: '.($result['failed'][0]['error'] ?? 'unknown error')], 422);
                    }

                    return response()->json(['message' => 'Test SMS sent via '.(config('services.sms.provider') === 'africastalking' ? 'Africa\'s Talking' : 'Advanta').'.']);

                case 'telegram':
                    if (! Telegram::enabled()) {
                        return response()->json(['message' => 'Add the bot token and chat ID first.'], 422);
                    }

                    return Telegram::send('✅ Tikooh test message: Telegram alerts are working.')
                        ? response()->json(['message' => 'Test message sent to the Telegram chat.'])
                        : response()->json(['message' => 'Telegram rejected the message. Check the token and chat ID.'], 422);
            }
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Failed: '.$e->getMessage()], 422);
        }

        abort(404);
    }

    /** Renders a template with sample data so the admin sees the real email. */
    public function preview(string $template): Response
    {
        [$order, $tickets, $event] = $this->sample();

        $html = match ($template) {
            'ticket' => (new TicketConfirmation($order, $tickets))->render(),
            'campaign' => (new CampaignMail(
                subjectLine: 'Our biggest night yet is coming',
                body: "Hi Wanjiru,\n\nThanks for partying with us last time. We're back with a bigger lineup and a new venue, and early bird tickets go fast.\n\nSee the details below.",
                featuredEvent: $event,
                unsubscribeUrl: '#',
                senderName: 'Akili Live via Tikooh',
            ))->render(),
            default => abort(404),
        };

        return response($html)->header('Content-Type', 'text/html; charset=UTF-8');
    }

    /** Unsaved models: previews never touch real data. */
    protected function sample(): array
    {
        $event = (new Event)->forceFill([
            'uuid' => 'preview', 'title' => 'Nairobi Sound Festival', 'host' => 'Akili Live',
            'start_date' => now()->addDays(12)->setTime(15, 0), 'end_date' => now()->addDays(12)->setTime(21, 0),
            'timezone' => 'Africa/Nairobi', 'location_name' => 'Uhuru Gardens', 'city' => 'Nairobi',
            'location_map_link' => 'https://maps.google.com/?q=Uhuru+Gardens', 'currency' => 'KES',
            'cover_image_path' => 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1200&q=80',
        ]);
        $event->setRelation('venue', null);
        $event->setRelation('ticketTiers', collect());

        $order = (new Order)->forceFill([
            'reference' => 'TKH-PREVIEW-0001', 'buyer_name' => 'Wanjiru Kamau', 'buyer_email' => 'wanjiru@example.com',
            'currency' => 'KES', 'subtotal' => 7000, 'discount_amount' => 500, 'fee_amount' => 0, 'total' => 6500,
        ]);
        $order->setRelation('event', $event);
        $order->setRelation('items', collect([
            (new OrderItem)->forceFill(['tier_name' => 'VIP', 'quantity' => 1, 'unit_price' => 5000, 'subtotal' => 5000]),
            (new OrderItem)->forceFill(['tier_name' => 'Early Bird', 'quantity' => 1, 'unit_price' => 2000, 'subtotal' => 2000]),
        ]));

        $ticket = function (string $code, string $tier, string $first, string $last) {
            $t = (new Ticket)->forceFill(['code' => $code]);
            $t->setRelation('ticketTier', (new TicketTier)->forceFill(['name' => $tier]));
            $t->setRelation('attendee', (new Attendee)->forceFill(['first_name' => $first, 'last_name' => $last]));

            return $t;
        };

        return [$order, collect([$ticket('TK-7Q4M-X2PA-9KDW', 'VIP', 'Wanjiru', 'Kamau'), $ticket('TK-H3ZR-4NVB-T8EL', 'Early Bird', 'Otieno', 'Odhiambo')]), $event];
    }
}
