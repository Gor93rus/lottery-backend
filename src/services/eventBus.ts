import { EventEmitter } from "events";

export interface EventPayload {
  type: string;
  data: unknown;
  timestamp: string;
  source: string;
}

/**
 * Event bus for inter-service communication
 * Supports both in-memory events and external message brokers
 */
export class EventBus extends EventEmitter {
  private eventHistory: EventPayload[] = [];
  private maxHistorySize = 1000;

  /**
   * Publish an event
   */
  publish(type: string, data: unknown, source = "lottery-backend"): void {
    const payload: EventPayload = {
      type,
      data,
      timestamp: new Date().toISOString(),
      source,
    };

    // Store in history
    this.addToHistory(payload);

    // Emit event
    this.emit(type, payload);

    // Also emit a generic 'event' for listeners who want all events
    this.emit("event", payload);

    console.log(`📢 Event published: ${type} from ${source}`);
  }

  /**
   * Subscribe to an event type
   */
  subscribe(
    type: string,
    handler: (payload: EventPayload) => void | Promise<void>,
  ): void {
    this.on(type, handler);
    console.log(`📡 Subscribed to event: ${type}`);
  }

  /**
   * Unsubscribe from an event type
   */
  unsubscribe(
    type: string,
    handler: (payload: EventPayload) => void | Promise<void>,
  ): void {
    this.off(type, handler);
    console.log(`📴 Unsubscribed from event: ${type}`);
  }

  /**
   * Subscribe to all events
   */
  subscribeAll(handler: (payload: EventPayload) => void | Promise<void>): void {
    this.on("event", handler);
    console.log("📡 Subscribed to all events");
  }

  /**
   * Get event history
   */
  getHistory(filter?: {
    type?: string;
    source?: string;
    limit?: number;
  }): EventPayload[] {
    let history = [...this.eventHistory];

    // Apply filters
    if (filter?.type) {
      history = history.filter((e) => e.type === filter.type);
    }
    if (filter?.source) {
      history = history.filter((e) => e.source === filter.source);
    }
    if (filter?.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    console.log("🗑️  Event history cleared");
  }

  /**
   * Add event to history
   */
  private addToHistory(payload: EventPayload): void {
    this.eventHistory.push(payload);

    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event statistics
   */
  getStats(): {
    totalEvents: number;
    eventTypes: Record<string, number>;
    sources: Record<string, number>;
  } {
    const stats = {
      totalEvents: this.eventHistory.length,
      eventTypes: {} as Record<string, number>,
      sources: {} as Record<string, number>,
    };

    for (const event of this.eventHistory) {
      // Count by type
      stats.eventTypes[event.type] = (stats.eventTypes[event.type] || 0) + 1;

      // Count by source
      stats.sources[event.source] = (stats.sources[event.source] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
export const eventBus = new EventBus();

// Define common event types
export const EventTypes = {
  // Ticket events
  TICKET_PURCHASED: "ticket.purchased",
  TICKET_CANCELLED: "ticket.cancelled",

  // Draw events
  DRAW_SCHEDULED: "draw.scheduled",
  DRAW_STARTED: "draw.started",
  DRAW_COMPLETED: "draw.completed",
  DRAW_FAILED: "draw.failed",

  // Payout events
  PAYOUT_INITIATED: "payout.initiated",
  PAYOUT_COMPLETED: "payout.completed",
  PAYOUT_FAILED: "payout.failed",

  // User events
  USER_REGISTERED: "user.registered",
  USER_VERIFIED: "user.verified",
  USER_UPDATED: "user.updated",

  // Gamification events
  QUEST_COMPLETED: "quest.completed",
  ACHIEVEMENT_UNLOCKED: "achievement.unlocked",
  REWARD_CLAIMED: "reward.claimed",
  LEVEL_UP: "level.up",

  // System events
  CACHE_INVALIDATED: "cache.invalidated",
  ERROR_OCCURRED: "error.occurred",
  SERVICE_STARTED: "service.started",
  SERVICE_STOPPED: "service.stopped",
};
