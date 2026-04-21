export interface NxPort {
  getAllApps(exclude: string[]): string[]
  getAffectedApps(baseSha: string, exclude: string[]): string[]
  getInitialCommit(): string
}
