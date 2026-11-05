declare module '@deepseek-ai/cordis' {
  export interface Context {
    tools: unknown
    locale: {
      register: (namespace: string, tables: Record<string, Record<string, string>>) => () => void
    }
    slots: {
      inject: (slotName: string, factory: () => () => void) => void
      register: <P = Record<string, unknown>>(
        options: { name: string; id: string; order?: number; locale?: string },
        render: (props: P) => unknown,
      ) => () => void
    }
    get: (serviceName: string) => unknown
    inject: (services: readonly string[], callback: (wired: Context) => void) => void
    effect: (setup: () => void | (() => void | Promise<void>), label?: string) => void
  }
}

declare module '@deepseek-ai/dsh-tools' {
  export interface ToolExecutionBlock {
    type?: string
    text?: string
  }

  export interface ToolExecutionResult {
    isError: boolean
    content: readonly ToolExecutionBlock[]
  }
}

declare module '@deepseek-ai/dsh-client-connection/client' {
  export interface ClientConnectionRpc {
    call: (channel: string, endpoint: string, payload: unknown) => Promise<unknown>
  }
}

declare module '@deepseek-ai/dsh-client-locale/client' {}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface LocaleNamespaceMap {}

  export type PropsLocale<NS extends string> = {
    t: (key: NS extends keyof LocaleNamespaceMap ? LocaleNamespaceMap[NS] : string) => string
  }
}
