const request = require('request-promise-native');
const jsdom = require('jsdom').JSDOM;
const encoder = require('js-htmlencode');
const fs = require('fs');

const jar = request.jar();

const homepage = 'http://s6.zetaboards.com/EmpireLost/index/';

// request utility functions

function loadCookies(filepath) {
  const data = fs.readFileSync(filepath);
  return data.toString().split(/;/g);
}

function setCookies(jar, cookies, url) {
  cookies.forEach(entry => {
    const cookie = request.cookie(entry.trim());
    jar.setCookie(cookie, url);
  });
}

async function getUrl(url) {
   try {
    return await request.get({url: url, jar: jar});
  } catch (e) {
    console.log(e);
  }
}

// JSDOM utility functions

function getDocument(html) {
  return new jsdom(html).window.document;
}

function querySelectorAll(element, selector) {
  return Array.prototype.slice.call(element.querySelectorAll(selector));
}

// DOM parsing functions

function getLinks(html) {
  const document = getDocument(html);
  const links = querySelectorAll(document, 'a');
  return links.filter(link => !!link.href).map(link => { return {url: link.href, text: link.innerHTML}; });
}

async function getSubforumLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  return getLinks(html).filter(link => link.url.match(/^.*\/forum\/.*$/));
}

async function getThreadLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  const forums = getLinks(html).filter(link => link.url.match(/^.*\/topic\/.*$/));
}


// scraping logic

if (!process.argv[2]) {
  console.log('usage: node index.js [path-to-cookie]');
  process.exit(0);
}
const cookiePath = process.argv[2];

const visited = {};

setCookies(jar, loadCookies(cookiePath), homepage);

(async () => {
  var forums = await getSubforumLinks(homepage);
  forums.forEach(forum => { console.log(encoder.htmlDecode(forum.text));} );
})();