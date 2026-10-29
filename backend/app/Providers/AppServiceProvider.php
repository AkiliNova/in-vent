<?php

namespace App\Providers;

use App\Events\TicketsIssued;
use App\Listeners\SendTicketConfirmation;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->configureRateLimiting();

        Event::listen(TicketsIssued::class, SendTicketConfirmation::class);

        // Catches a relation accessed without eager-loading before it reaches
        // production as an N+1 on an attendee list.
        Model::preventLazyLoading($this->app->isLocal());
        Model::preventSilentlyDiscardingAttributes($this->app->isLocal());
    }

    /**
     * `throttleApi()` in bootstrap/app.php resolves the "api" limiter, which
     * has to be registered here or every API request 500s.
     */
    protected function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request) {
            // Signed-in callers are limited per user; anonymous traffic per IP,
            // more tightly, since that is where abuse arrives.
            return $request->user()
                ? Limit::perMinute(300)->by('user:'.$request->user()->id)
                : Limit::perMinute(60)->by('ip:'.$request->ip());
        });
    }
}
