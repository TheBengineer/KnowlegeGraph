const MCP_URL = '/mcp'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: Record<string, unknown>
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0'
  id: number
  result?: {
    content: Array<{ type: string; text: string }>
    isError: boolean
  }
  error?: {
    code: number
    message: string
  }
}

let requestId = 1

export async function callMcp<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const body: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: method,
      arguments: params,
    },
  }

  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`MCP request failed: ${response.status} ${response.statusText}`)
  }

  const data: JsonRpcResponse<T> = await response.json()

  if (data.error) {
    throw new Error(`MCP error: ${data.error.message}`)
  }

  if (!data.result || data.result.isError) {
    throw new Error('MCP tool returned an error')
  }

  // Find the text content in the response
  const textContent = data.result.content?.find(c => c.type === 'text')
  if (!textContent) {
    throw new Error('No text content in MCP response')
  }

  return JSON.parse(textContent.text) as T
}
