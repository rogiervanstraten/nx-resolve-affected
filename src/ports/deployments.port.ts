export interface DeploymentsPort {
  getLastSuccessfulSha(envName: string, ref?: string): Promise<string | null>
}
