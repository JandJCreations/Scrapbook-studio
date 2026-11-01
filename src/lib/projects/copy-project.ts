/** The parts of a project row that make up its content. */
export interface ProjectContentRow {
  name: string;
  folder_id: string | null;
  thumbnail_path: string | null;
  timeline: unknown;
  frame_width: number;
  frame_height: number;
}

/** The row to insert for a copy of a project: same content, frame and thumbnail, a fresh revision, named as a copy. */
export function duplicatePayload(source: ProjectContentRow, ownerId: string) {
  return {
    owner_id: ownerId,
    name: `${source.name} (Copy)`,
    folder_id: source.folder_id,
    thumbnail_path: source.thumbnail_path,
    // Cloned so the copy never shares an object with the original.
    timeline: source.timeline == null ? null : (JSON.parse(JSON.stringify(source.timeline)) as unknown),
    timeline_rev: 0,
    frame_width: source.frame_width,
    frame_height: source.frame_height,
  };
}
