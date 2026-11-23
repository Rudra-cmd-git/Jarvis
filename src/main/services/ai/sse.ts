export interface SseEvent {
  event: string | null;
  data: string;
  id: string | null;
}

/**
 * Incremental Server-Sent Events parser. It accepts arbitrary text chunks, so
 * a network read boundary never has to align with an SSE event boundary.
 */
export class SseDecoder {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName: string | null = null;
  private lastId: string | null = null;

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];

    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const rawLine = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      this.processLine(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine, events);
      newline = this.buffer.indexOf('\n');
    }

    return events;
  }

  /** Flush a trailing line/event when the stream ends without a blank line. */
  flush(): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.buffer.length > 0) {
      const rawLine = this.buffer;
      this.buffer = '';
      this.processLine(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine, events);
    }
    this.dispatch(events);
    return events;
  }

  private processLine(line: string, events: SseEvent[]): void {
    if (line === '') {
      this.dispatch(events);
      return;
    }
    if (line.startsWith(':')) {
      return;
    }

    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    switch (field) {
      case 'data':
        this.dataLines.push(value);
        break;
      case 'event':
        this.eventName = value;
        break;
      case 'id':
        this.lastId = value;
        break;
      default:
        break;
    }
  }

  private dispatch(events: SseEvent[]): void {
    const data = this.dataLines.join('\n');
    const eventName = this.eventName;
    this.dataLines = [];
    this.eventName = null;
    if (data.trim() === '') {
      return;
    }

    events.push({
      event: eventName,
      data,
      id: this.lastId,
    });
  }
}
