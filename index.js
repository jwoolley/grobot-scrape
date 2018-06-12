const request = require('request-promise-native');
const jsdom = require('jsdom').JSDOM;
const fs = require('fs');

const jar = request.jar();

const homepage = 'http://s6.zetaboards.com/EmpireLost/index/';

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

function getLinks(html) {
  return html.match(/href='.*?'|href=".*?"/g)
    .reduce((links, link) => {
      try {
        var match = link.match(/href='(.*?)'|href="(.*?)"/);
        links.push(match[1] || match[2]);
      } catch(e) {
        console.warn('Unable to parse link from ' + link);
      }
      return links;
    }, []);
}

async function getSubforumLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  return getLinks(html).filter(link => link.match(/^.*\/forum\/.*$/));
}

async function getThreadLinks(forumUrl) {
  const html = await getUrl(forumUrl);
  const forums = getLinks(html).filter(link => link.match(/^.*\/topic\/.*$/));
}

function querySelectorAll(element, selector) {
  return Array.prototype.slice.call(element.querySelectorAll(selector));
}

function getDocument(html) {
  return new jsdom(html).window.document;
}

function testJsdom(html) { 
  //Array.prototype.slice.call(document.querySelectorAll('#nav li span')).pop().innerHTML

  // const dom = new jsdom(html);
  // // console.log(dom.window.document.body.innerHTML);

  // console.log(dom.window.document.querySelectorAll('a').filter);
  const document = getDocument(html);
  const links = querySelectorAll(document, 'a');
  console.log('links.filter: ' + links.filter);
}

const visited = {};

if (!process.argv[2]) {
  console.log('usage: node index.js [path-to-cookie]');
  process.exit(0);
}
const cookiePath = process.argv[2];

setCookies(jar, loadCookies(cookiePath), homepage);

(async () => {
  // var subforums = await getSubforumLinks(homepage);
  // console.log(subforums);

  testJsdom(await getUrl(homepage));
})();