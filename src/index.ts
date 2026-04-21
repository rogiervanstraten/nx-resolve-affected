import * as core from '@actions/core'
import { run } from './main.js'

/* istanbul ignore next */
run().catch((e: Error) => core.setFailed(e.message))
