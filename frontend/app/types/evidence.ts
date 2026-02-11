export interface LogEntry {
    "@timestamp"?: string;
    "log.level"?: string;
    message?: string;
    "service.name"?: string;
    [key: string]: unknown;
}

export interface TraceSpan {
    "trace.id"?: string;
    "span.id"?: string;
    "parent.id"?: string;
    "service.name"?: string;
    "event.duration"?: number;
    "@timestamp"?: string;
    message?: string;
    "span.name"?: string;
    [key: string]: unknown;
}

export interface MetricPoint {
    "@timestamp"?: string;
    "service.name"?: string;
    "metric.name"?: string;
    "metric.value"?: number;
    message?: string;
    [key: string]: unknown;
}
