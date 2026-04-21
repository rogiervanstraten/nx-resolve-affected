export interface DeploymentsPort {
  getLastSuccessfulSha(envName: string): Promise<string | null>
}
