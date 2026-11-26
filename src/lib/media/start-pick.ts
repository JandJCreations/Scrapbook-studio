/**
 * Photos and videos picked in the New video dialog, waiting for the editor of
 * the project they were picked for. The dialog opens the photo picker straight
 * away (an iPhone only opens it from a tap), starts the uploads, then hands
 * the new library ids to the editor so its start card can offer "Make my
 * video" at once. Kept in memory: it only has to survive the page change.
 */
const picks = new Map<string, string[]>();

export function setStartPick(projectId: string, mediaIds: string[]): void {
  picks.set(projectId, mediaIds);
}

export function getStartPick(projectId: string): string[] | undefined {
  return picks.get(projectId);
}

export function clearStartPick(projectId: string): void {
  picks.delete(projectId);
}
