import { HyperDurable } from '@ticketbridge/hyper-durable'

// Hyper-Durables have a small issue with Arrays.
// This seems to fix it?
const clone = (x) => JSON.parse(JSON.stringify(x))

export class StorageDurable extends HyperDurable {
  constructor(state, env) {
    super(state, env)

    this.webhooks = []
  }

  list_webhooks(filter) {
    if (!filter) return this.webhooks

    return this.webhooks.filter(webhook => {
      return webhook.events.some(event => {
        // We need to compare the event ID with the filter.
        // The filter can have wildcards.
        const r = new RegExp(`^${event.replace('.', '\.').replace(/\*/g, '.*')}$`)
        return r.test(filter)
      })
    })
  }

  create_webhook(webhook) {
    this.webhooks.push(webhook)
  }

  delete_webhook(webhook_id) {
    this.webhooks = clone(this.webhooks.filter(webhook => webhook.id !== webhook_id))
  }
  
  set_webhook_status(webhook_id, status) {
    const webhook = this.webhooks.find(webhook => webhook.id === webhook_id)
    webhook.lastStatus = status
    webhook.lastExecuted = new Date().toISOString()
  }
}