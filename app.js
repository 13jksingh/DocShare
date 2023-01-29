// Require Packages 
require('dotenv').config()
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const multer  = require('multer');
const {GridFsStorage} = require('multer-gridfs-storage');4
const Grid = require('gridfs-stream');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const findOrCreate = require('mongoose-find-or-create')
const GoogleStrategy = require('passport-google-oauth20');
const _ = require('passport-local-mongoose');

// Express setup
const app = express();
app.use(bodyParser.urlencoded({extended:true}));
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

mongoose.set('strictQuery',true);

app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

// Mongoose and GridFS
const connection = mongoose.connect("mongodb://127.0.0.1:27017/DocShareDB");
var conn = mongoose.createConnection("mongodb://127.0.0.1:27017/DocShareDB");
const storage = new GridFsStorage({ db: connection , file: (req, file) => {return 'file_' + Date.now();}});
let gfs, gridfsBucket;
  conn.once('open', () => {
   gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
 });
   gfs = Grid(conn.db, mongoose.mongo);
})
const upload = multer({ storage });

// User Model
const userSchema = new mongoose.Schema({
    name : String,
    password: String,
    email: String,
    googleId:Number,
    fileAuthor:[mongoose.Schema.Types.ObjectId],
    fileAcess:[String]
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("userdb",userSchema);

passport.use(User.createStrategy());


passport.serializeUser(function(user, done) {
    done(null, user.id);
  });
  
  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
    });
  });



// Google Auth 
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT,
    clientSecret: process.env.SECRET,
    callbackURL: 'http://localhost:3000/auth/google/workspace',
    scope: [ 'profile' ],
    state: true
  },
  function (accessToken, refreshToken, profile, cb) {
    User.findOrCreate({googleId:profile.id},function(err,user){
        return cb(err,user);
    })
  }
));


// Routes 
app.get("/",function(req,res){
    res.render("home");
});

app.get("/login",function(req,res){
    res.render("login");
});

app.get("/register",function(req,res){
    res.render("register");
});

app.post("/login",function(req,res){
    const user = new User({
        username: req.body.username,
        password: req.body.password
    });

    req.login(user,function(err){
        if (err){
            console.log(err);
        }else{
            passport.authenticate("local")(req,res,function(){
                res.redirect("/workspace");
            })
        }
    })
});
app.get("/workspace/:fileId",function(req,res){
    if (req.isAuthenticated()) {
        gfs.files.findOne({ filename: req.params.fileId }, function (err, file) {
            if (!err) {
                const id = mongoose.Types.ObjectId(file._id);
                if ((req.user.fileAuthor).includes(id)){
                    const readStream = gridfsBucket.openDownloadStream(file._id);
                    readStream.start();
                    readStream.pipe(res);
                }else{
                    res.send("Not Accessable");
                }
            }
        })   
    }else{
        res.redirect("/login");
    } 
});

app.get("/workspace",function(req,res){
    if (req.isAuthenticated()) {
        const ids = req.user.fileAuthor;
        gfs.files.find({_id:{$in:ids}}).toArray((err, files) => {
            res.render("workspace", { files: files });
        });
    }else{
        res.redirect("/login");
    } 
});

app.post("/workspace",upload.single('file'),function(req,res){
    User.findOne({_id:req.user._id},function(err,doc){
        if (doc){
            doc.fileAuthor.push(req.file.id);
            doc.save(function(e){
                if(!e){
                    console.log("Doc Saved");
                }else{
                    console.log(e);
                }
            })
        }else{
            console.log(err);
        }
    });
    res.redirect("/workspace");
});

app.get("/logout",function(req,res){
    req.logOut(function(err){
        if (!err){
            res.redirect("/");
        }else{
            console.log(err);
        }
    });
});

app.post("/register",function(req,res){
    User.register({username:req.body.username},req.body.password,function(err,user){
      if (err){
        console.log(err);
        res.redirect("/register");
      }else{
        passport.authenticate("local")(req,res,function(){
            res.redirect("/workspace");
        })
      }
    })
});


app.get('/auth/google', passport.authenticate('google'));
app.get('/auth/google/workspace',
    passport.authenticate('google', { failureRedirect: '/', failureMessage: true }),
    function (req, res) {
        res.redirect('/workspace');
    });


// Server 
app.listen(3000,function(err){
    if (err){
        console.log(err);
    }else{
        console.log("Listening on port 3000");
    }
});