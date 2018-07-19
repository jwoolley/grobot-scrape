# grobot-scrape

To scrape as a logged-in user, you'll need to get a valid auth cookie from the website. Here's how to do it:

1) while logged into grobot, open network tab in dev tools
2) load any page on the site
3) look at "Cookie" field under "Request Headers" on Headers subtab
4) cookie value should look something like:
	930418sess=00727d185d50c5e9d780745
5) save this string to a (local) file (in an ignored directory. don't commit it to git!)
6) run "node index.js path/to/cookie-file"