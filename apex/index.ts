/**
 * plotlineapp.online → https://www.plotlineapp.online, keeping the path and query.
 * One canonical host means one session cookie and one set of saved events per browser.
 */
export default {
  async fetch(req) {
    const url = new URL(req.url)
    url.protocol = 'https:'
    url.hostname = 'www.plotlineapp.online'
    return Response.redirect(url.toString(), 301)
  },
} satisfies ExportedHandler
