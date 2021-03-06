module.exports = handler

var debug = require('debug')('qpm_media:random_rate_audio')
var fs = require('fs')
var qpm_media = require('../../')
var Negotiator = require('negotiator')
var wc = require('webcredits')
var wc_db = require('wc_db')
var qpm_ui = require('qpm_ui');

function handler(req, res) {

  var origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  var defaultCurrency = res.locals.config.currency || 'https://w3id.org/cc#bit';

  var source      = req.body.source;
  var destination = req.body.destination;
  var currency    = req.body.currency || defaultCurrency;
  var amount      = req.body.amount;
  var timestamp   = null;
  var description = req.body.description;
  var context     = req.body.context;

  var type        = req.query.type || 'getRandomAudio'
  var currentTime = req.query.currentTime || 0

  var fn
  var cost = 25
  debug(type)
  if (type === 'getRandomImage') {
   fn = qpm_media.getRandomImage
   cost = 25
 } else if ( type === 'getRandomUnseenFragment' ) {
   cost = 200
   fn = qpm_media.getRandomUnseenFragment
 } else if ( type === 'getRandomAudio' ) {
   cost = 25
   fn = qpm_media.getRandomAudio
 } else if ( type === 'getLastFragment' ) {
   cost = 50
   fn = qpm_media.getLastFragment
 } else if ( type === 'getRatedFragment' ) {
   cost = 50
   fn = qpm_media.getRatedFragment
 }



  var source      = req.session.userId

  if (!req.session.userId) {
    res.send('must be authenticated')
    return
  }


  var config = res.locals.config
  var conn   = res.locals.sequelize
  var faucetURI = 'https://w3id.org/cc#faucet'

  var sequelize = wc_db.getConnection(config.db);
  wc.getBalance(source, sequelize, config, function(err, ret){
    if (err) {
      console.error(err);
    } else {
      console.log(ret);
      var balance = ret

      if (balance > cost) {

        var credit = {};

        credit["https://w3id.org/cc#source"] = req.session.userId
        credit["https://w3id.org/cc#amount"] = cost
        credit["https://w3id.org/cc#currency"] = 'https://w3id.org/cc#bit'
        credit["https://w3id.org/cc#destination"] = faucetURI
        balance -= cost


        wc.insert(credit, res.locals.sequelize, res.locals.config, function(err, ret) {
          if (err) {
            res.write(err);
          } else {

            fn({}, config, conn).then(function(ret){
              if (err) {
                console.error(err)
              } else {

                var availableMediaTypes = ['text/html', 'text/plain', 'application/json']

                var negotiator = new Negotiator(req)
                var mediaType = negotiator.mediaType(availableMediaTypes)
                debug(mediaType)
                var content
                var media
                debug(ret.ret)
                if (ret.ret && ret.ret[0] && ret.ret[0][0] && ret.ret[0][0].uri) {
                  media = ret.ret[0][0]
                  content = ret.ret[0][0].uri
                } else {
                  res.render('pages/media/random_rate_audio', { ui : config.ui })
                  return
                }
                debug(media)
                if (req.query && req.query.uri) {
                  content = req.query.uri
                }
                var params = {}
                params.uri = content
                params.reviewer = req.session.userId

                //qpm_media.getRating(params, config, conn).then(function(ret){
                qpm_media.getRating(params, config, conn).then(function(ret) {

                  var row = ret.ret[0]
                  console.log(row)
                  console.log(row[0])
                  if (row && row.length > 0) {
                    config.ui.rating = row[0].rating
                    console.log(row[0]);
                  } else {
                    config.ui.rating = null
                  }

                  return qpm_media.getTags(params, config, conn)
                }).then(function(tags){
                  debug("tags")
                  debug(tags.ret[0])
                  var a = []
                  for (var i = 0; i < tags.ret[0].length; i++) {
                    a.push(tags.ret[0][i].tag)
                  }
                  config.ui.tags = a

                  res.status(200)
                  res.header('Content-Type', mediaType)
                  if (mediaType === 'text/html') {


                    config.ui.content = content
                    config.ui.balance = balance
                    config.ui.currentTime = currentTime || 0
                    res.render('pages/media/random_rate_audio', { ui : config.ui })


                  } else if ( mediaType === 'application/json' ) {
                    res.write(JSON.stringify(media))
                    res.end()
                  } else if ( mediaType === 'text/plain' ) {
                    res.write(content)
                    res.end()
                  }

                }).catch(function(err) {
                  console.error(err)
                  res.write(err.toString())
                  res.end()
                })


              }
              sequelize.close()
            })


          }

        });


      } else {
        res.statusCode = 402;
        res.send('HTTP 402!  This resource has paid access control!')
      }


    }
    sequelize.close();
  });


}
