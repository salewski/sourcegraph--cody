import { Meta, StoryObj } from '@storybook/react'

import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/cody-shared/src/telemetry'
import { noOpTelemetryRecorder } from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'

import { LoginSimplified } from './OnboardingExperiment'
import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'
import { VSCodeWrapper } from './utils/VSCodeApi'

const meta: Meta<typeof LoginSimplified> = {
    title: 'cody/App-less Onboarding',
    component: LoginSimplified,
    decorators: [VSCodeStoryDecorator],
}

export default meta

const vscodeAPI: VSCodeWrapper = {
    postMessage: () => {},
    onMessage: () => () => {},
    getState: () => ({}),
    setState: () => {},
}

export const Login: StoryObj<typeof LoginSimplified> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <LoginSimplified
                simplifiedLoginRedirect={() => {}}
                telemetryService={NOOP_TELEMETRY_SERVICE}
                telemetryRecorder={noOpTelemetryRecorder}
                uiKindIsWeb={false}
                vscodeAPI={vscodeAPI}
            />
        </div>
    ),
}

export const LoginWeb: StoryObj<typeof LoginSimplified> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <LoginSimplified
                simplifiedLoginRedirect={() => {}}
                telemetryService={NOOP_TELEMETRY_SERVICE}
                telemetryRecorder={noOpTelemetryRecorder}
                uiKindIsWeb={true}
                vscodeAPI={vscodeAPI}
            />
        </div>
    ),
}
