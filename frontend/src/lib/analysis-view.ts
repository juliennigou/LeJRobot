import type { AudioAnalysis, SongSection } from "@/lib/types";

export function formatDuration(durationSeconds?: number | null) {
  if (!durationSeconds && durationSeconds !== 0) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function downsample(values: number[], count: number) {
  if (!values.length || count <= 0) {
    return [];
  }

  if (values.length <= count) {
    return values;
  }

  const bucketSize = values.length / count;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * bucketSize);
    const end = Math.min(values.length, Math.floor((index + 1) * bucketSize));
    const slice = values.slice(start, Math.max(start + 1, end));
    return average(slice);
  });
}

export function sampleSeries(values: number[], index: number) {
  if (!values.length) {
    return 0;
  }

  const safeIndex = Math.max(0, Math.min(values.length - 1, index));
  return values[safeIndex] ?? 0;
}

export function currentSection(sections: SongSection[], timeSeconds: number) {
  return sections.find((section) => timeSeconds >= section.start_seconds && timeSeconds < section.end_seconds) ?? sections[0] ?? null;
}

export function beatDensity(analysis: AudioAnalysis | null) {
  if (!analysis || analysis.duration_seconds <= 0) {
    return 0;
  }

  return analysis.beats.length / analysis.duration_seconds;
}
