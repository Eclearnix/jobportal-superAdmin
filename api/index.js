import { app } from '../server/index.js'

export default function handler(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost')
  const apiPath = requestUrl.searchParams.get('_api_path')
  if (apiPath === null) {
    return app(req, res)
  }

  requestUrl.searchParams.delete('_api_path')
  const path = apiPath.replace(/^\/+|\/+$/g, '')
  req.url = `/api/${path}${requestUrl.search}`
  return app(req, res)
}
