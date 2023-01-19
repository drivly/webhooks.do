

# Drivly Webhooks management API

This is the API for managing webhooks on Drivly. It's a simple API that allows you to create, delete, and view webhooks. All while abstracting away the complexity of the underlying storage and event triggering.

## API

Note: All API endpoints require authentication. You can authenticate by visiting /login or by visiting https://apikeys.do/api and claiming a key to use in the Authorization header.

All webhook events are scoped to the user. You will only get events from other services if you used your account to link them. For example, if you linked your Driv.ly account to your Embeds account, you will get events from Embeds.

This API is a hyper-media driven API. This means that all responses will contain links to other resources. For example, when you create a webhook, the response will contain a link to the webhook's logs.

### `GET /api/webhooks`

Returns a list of webhooks for the current user.

### `POST /api/webhooks/create`

Creates a new webhook for the current user. The body must contain the following:

- `url`: The URL to send the webhook to.
- `events`: An array of events to listen for.

### `GET /api/webhooks/:id/delete`

Deletes a webhook.

### `GET /api/webhooks/:id/logs`

Returns a list of logs for a webhook.

### `GET /api/webhooks/:id/trigger-test`

Triggers a test event for a webhook. This is useful for testing if a webhook is working, or if you want to see what the event payload looks like.

### `POST /api/trigger`

This is the endpoint that other services use to trigger events. It's not meant to be used by you, but it's documented here for completeness.

The body must contain the following:

- `userID`: The ID of the user to trigger the event for.
- `event`: The event name.
- `object`: The event object.

## [Drivly Open](https://driv.ly/open) - [Accelerating Innovation through Open Source](https://blog.driv.ly/accelerating-innovation-through-open-source)

Our [Drivly Open Philosophy](https://philosophy.do) has these key principles:

1. [Build in Public](https://driv.ly/open/build-in-public)
2. [Create Amazing Developer Experiences](https://driv.ly/open/amazing-developer-experiences)
3. [Everything Must Have an API](https://driv.ly/open/everything-must-have-an-api)
4. [Communicate through APIs not Meetings](https://driv.ly/open/communicate-through-apis-not-meetings)
5. [APIs Should Do One Thing, and Do It Well](https://driv.ly/open/apis-do-one-thing)


##  🚀 We're Hiring!

[Driv.ly](https://driv.ly) is [deconstructing the monolithic physical dealership](https://blog.driv.ly/deconstructing-the-monolithic-physical-dealership) into [simple APIs to buy and sell cars online](https://driv.ly), and we're funded by some of the [biggest names](https://twitter.com/TurnerNovak) in [automotive](https://fontinalis.com/team/#bill-ford) and [finance & insurance](https://www.detroit.vc)

Our entire infrastructure is built with [Cloudflare Workers](https://workers.do), [Durable Objects](https://durable.objects.do), [KV](https://kv.cf), [PubSub](https://pubsub.do), [R2](https://r2.do.cf), [Pages](https://pages.do), etc.  [If you love the Cloudflare Workers ecosystem as much as we do](https://driv.ly/loves/workers), we'd love to have you [join our team](https://careers.do/apply)!


