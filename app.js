//configure file
var conf = require('./conf')

var facebook = require('./facebook.js');

//express
var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app);
var sio = require('socket.io');
var io = sio.listen(server);

//configure socket.io
io.configure(function() {
    io.enable('browser client minification'); // send minified client
    io.enable('browser client etag'); // apply etag caching logic based on version number
    io.enable('browser client gzip'); // gzip the file
    io.set('log level', 1); // reduce logging
});



var passport = require('passport'),
    FacebookStrategy = require('passport-facebook').Strategy,
    LocalStrategy = require('passport-local').Strategy;

//config express
app.configure(function() {
    app.use(express.compress());
    app.set('views', __dirname + '/views');
    app.set('view options', {
        layout: false
    });
    app.set('view engine', 'ejs');
    app.use(express.cookieParser());
    app.use(express.bodyParser());
    app.use(express.session({
        secret: 'sessionbartwithmesecret'
    }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(express.static(__dirname + '/static'));
    app.use(app.router);
});

//mongoskin
var mongo = require('mongoskin');
var db = mongo.db('localhost:27017/bartwithme?auto_reconnect', {safe: true});
var ObjectID = db.ObjectID;
var userColl = db.collection('users');
var userInfoColl = db.collection('userinfo');

//passport code
passport.use(new FacebookStrategy({
    clientID: conf.fb.appId,
    clientSecret: conf.fb.appSecret,
    callbackURL: "http://localhost:"+conf.expressPort+"/auth/facebook/callback"
}, function(accessToken, refreshToken, profile, done) {

    facebook.getFbData(accessToken, '/me/friends', function(data){
        var friends = [];
        var data = JSON.parse(data);
        for (var i = 0; i < data.data.length; i++) {
            friends.push({fbID: data.data[i]['id']});
        }
        userColl.findOne({
            fbID: profile.id
        }, function(err, account) {

            if (err) {
                return done(err);
            }
            if (account) {
                var toInsert = {$set: {friends: friends}};
                userColl.update( {fbID : profile.id} , toInsert, function(err){
                    if (err){
                        return done(err);
                    } else {
                        userColl.findOne({
                            fbID: profile.id
                        }, function(err, accountUpdated) {
                            return done(null, accountUpdated)
                        });
                    }
                });
            } else {
                var newAccount = {};
                newAccount.type = 'facebook';
                newAccount.picture = 'https://graph.facebook.com/' + profile.id + '/picture'
                newAccount.name = profile.displayName;
                //newAccount.myId = {fbID : profile.id}
                newAccount.friends = friends;
                newAccount.fbID = profile.id;
                newAccount.date = new Date();
                userColl.insert(newAccount, function(err, result) {
                    if (err) {
                        console.log("Facebook Insert Error in User Collection: " + err);
                        return done(err);
                        return;
                    } else {
                        return done(null, result[0]);
                        //do nothing, adding was a success
                    }
                });
            }
        });
    });
}));

passport.serializeUser(function(user, done) {
    done(null, user._id);
});

passport.deserializeUser(function(id, done) {
    userColl.findOne({
        _id: ObjectID.createFromHexString(id)
    }, function(err, user) {
        done(err, user);
    });
});

passport.use(new LocalStrategy(function(username, password, done) {
    if (username) {
        userColl.findOne({
            username: username
        }, function(err, user) {
            if (err) {
                return done(err);
            }
            if (!user) {
                return done(null, false, {
                    message: 'Unknown user'
                });
            }
            /*
                if (!user.validPassword(password)) {
                    return done(null, false, { message: 'Invalid password' });
                }
                */
            return done(null, user);
        });
    } else {
        return done(null, false, {
            message: 'Empty username'
        });
    }
}));

app.get('/', function(req, res) {
    if (req.user) {
        res.render("index", {
            user: req.user
        });
    } else {
        res.redirect('/login');
    }
});

app.get('/login', function(req, res) {
    if (req.user) {
        res.redirect('/');
    } else {
        res.render('login');
    }
});

app.get("/logout", function(req, res) {
    req.logOut();
    res.redirect('/');
});

app.post('/register/local', function(req, res) {
    var regUser = req.body;
    userColl.findOne({
        username: regUser.username
    }, function(err, account) {
        if (err) {
            console.log("Find Error in User Collection: " + err);
            return;
        }
        if (account) {
            //account already exists, redirect to login page.
            res.redirect('/login')
        } else {
            var newAccount = {};
            newAccount.type = 'local';
            newAccount.picture = '/img/test.jpg';
            newAccount.name = regUser.name;
            newAccount.username = regUser.username;
            newAccount.password = regUser.password;
            newAccount.date = new Date();
            userColl.insert(newAccount, function(err, result) {
                if (err) {
                    console.log("Local Insert Error in User Collection: " + err);
                    return;
                } else {
                    //do nothing, adding was a success
                }
                res.redirect('/login');
            });
        }
    });
});
app.get('/auth/facebook', passport.authenticate('facebook'));
app.get('/auth/facebook/callback', passport.authenticate('facebook', {
    successRedirect: '/',
    failureRedirect: '/login'
}));
app.post('/auth/local', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: 'Invalid credentials'
}));

app.post('/reportTimeAndRoute', function(req, res){
    var time = req.body.time;
    var route = req.body.route;
    if(req.user){
        var toInsert = {$set: {time: time , route: route}};
        userColl.update( {_id : req.user._id} , toInsert, function(err){
            if (err){
                throw err;
            }
            res.send({status: 'ok'});
        });
        userColl.findOne({_id: req.user._id}, function(err, result){
            var friends = result.friends;
            var findObj = {$or: friends} 
            userColl.find(findObj , function(err, cursor) {
                if (err){
                    throw err;
                }
                cursor.toArray(function(err, results){
                    var data = []
                    for (var i = 0; i < results.length; i++){
                        var sID = results[i].socketID;
                        io.sockets.socket(sID).emit('updatedTime', {time: time, route: route, fbID: result.fbID, name: result.name} );
                    }
                });
            });
        });
    } 
    else {
        res.send({status: 'error'})
    }
});

app.post('/reportFriends', function(req, res){
    var friends = req.body.friends //[ {fbID:} , ]
    if (req.user){
        var toInsert = {$set: {friends: friends}};
        userColl.update( {_id : req.user._id} , toInsert, function(err){
           if (err){
               throw err;
           } 
           res.send({status: 'ok'});
        });
    }
    else {
        res.send({status: 'error'});
    }  
})

app.post('/getFriendsTimesAndRoutes' , function(req, res){
    if (req.user){
        userColl.findOne(  {_id : req.user._id}, function(err, result) {
            var friends = result.friends;
            var findObj = {$or: friends};
            userColl.find(findObj , function(err, cursor) {
                if (err){
                    throw err;
                }
                cursor.toArray(function(err, results){
                    var data = []
                    for (var i = 0; i < results.length; i++){
                        var result;
                        if (results[i].fbID){
                            result = {fbID: results[i].fbID, time: results[i].time , route: results[i].route, name: results[i].name};
                        }
                        if(result){
                            data.push(result);
                        }
                    }
                    res.send({status: 'ok' ,  data: data});
                });
            });
        });
    }
});

io.sockets.on('connection', function (socket) {
    socket.on('join', function (data) {
        console.log(data);
        var userID = data._id
        var toInsert = {$set: {socketID: socket.id}};
        userColl.update( {_id :  ObjectID.createFromHexString(userID) } , toInsert, function(err){
           if (err){
                console.log(err);
           } 
        });
    });
    socket.on('disconnect', function(){
        var socketID = socket.id
        var toInsert = {$set: {socketID: null}};
        userColl.update( {socketID :  socketID } , toInsert, function(err){
           if (err){
                console.log(err);
           } 
        });
    });
});

server.listen(conf.expressPort);
console.log('Express on port: ' + conf.expressPort);