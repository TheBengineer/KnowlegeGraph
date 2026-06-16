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

/**
 * Parse a Streamable HTTP SSE response into a JSON-RPC response object.
 *
 * Format from FastMCP:
 *   event: message
 *   data: {"jsonrpc":"2.0","id":1,"result":{...}}
 *   (empty line)
 */
function parseSseResponse<T>(text: string): JsonRpcResponse<T> {
  const lines = text.split('\n')
  let dataStr = ''
  let eventType = ''

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      dataStr += line.slice(6)
    }
  }

  if (!dataStr) {
    throw new Error(`No data field in SSE response (event: ${eventType})`)
  }

  return JSON.parse(dataStr) as JsonRpcResponse<T>
}

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
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`MCP request failed: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') || ''

  // FastMCP Streamable HTTP may return SSE or JSON depending on version/mode
  let data: JsonRpcResponse<T>
  if (contentType.includes('text/event-stream')) {
    const text = await response.text()
    data = parseSseResponse<T>(text)
  } else {
    data = await response.json()
  }

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
