const express = require('express');
const router = express.Router();
const AppDAO = require('../models/dao');
const UrlRepository = require('../models/url');
const UserRepository = require('../models/users');
const UserAccessRepository = require('../models/user-access');
const controller = require('../controllers/helper');
const userController = require('../controllers/user');
const dbConfig = require('../config/database');
const serverConfig = require('../config/server');
const base62 = require('base62');
const {check, validationResult} = require('express-validator/check');

const dao = new AppDAO(dbConfig.database.name)
const urlRepo = new UrlRepository(dao)
const userRepo = new UserRepository(dao)
const userAccessRepo = new UserAccessRepository(dao)


router.get('/', function(req, res) {
  res.render('index')
});

router.get('/shorten-url', controller.ensureAuthenticated, function(req, res) {
  res.render('shorten-url', {
    user: req.user,
    errors: [],
    url: ''
  })
});

router.post('/shorten-url', userController.validateUrl(urlRepo), controller.ensureAuthenticated, async function(req, res) {
  url = req.body.url;
  customUrl = req.body.shorturl || '';
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.render('shorten-url', {
      user: req.user,
      errors: errors.array(),
      url: ''
    });
  } else {
    const shortUrl = urlRepo.getByLongUrl(url)
      .then((result) => {
        if (!result) {
          return urlRepo.getMaxId()
            .then((maxRes) => {
              const id = maxRes ? maxRes.id + 1 : 1;
              if(customUrl) {
                urlRepo.create(id, url, customUrl)
                  .then(() => userAccessRepo.create(req.user.id, id));
                return customUrl;
              } else {
                newUrl = base62.encode(id + 10000);
                urlRepo.create(id, url, newUrl)
                  .then(() => userAccessRepo.create(req.user.id, id));
                return newUrl;
              }
            });
        } else {
          req.flash('warning', 'Shortened url already exists!')
          userAccessRepo.create(req.user.id, result.id);
          return Promise.resolve((result.new_url))
        }
      });
    shortUrl.then((newUrl) => {
      res.render('shorten-url', {
        user: req.user,
        errors: [],
        url: req.protocol + '://' + req.hostname + ':' + serverConfig.server.port + '/short/' + newUrl
      });
    })
  }
});

router.get('/view-urls', controller.ensureAuthenticated, function(req, res) {
  urlRepo.getAllByUserId(req.user.id)
    .then((urlCodes) => {
      res.render('view-urls', {
        user: req.user,
        enteries: urlCodes,
        url: req.protocol + '://' + req.hostname + ':' + serverConfig.server.port + '/short/'
      });
    });
});

router.get('/short/:encoded_id', redirectRequest);

router.post('/short/:encoded_id', redirectRequest);

router.put('/short/:encoded_id', redirectRequest);

router.delete('/short/:encoded_id', redirectRequest);

async function redirectRequest(req, res, next) {
 const encodedId = req.params.encoded_id;
 try {
   urlRepo.getByShortUrl(encodedId)
     .then((result) => {
       res.redirect(result.original_url)
     });
 } catch (e) {
   res.redirect("./");
   next();
 }
}

module.exports = router;
