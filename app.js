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
    secret: process.env.BSECRET,
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
    fileAcess:[mongoose.Schema.Types.ObjectId]
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
        gfs.files.findOne({ _id: mongoose.Types.ObjectId(req.params.fileId) }, function (err, file) {
            if (!err) {
                // const id = mongoose.Types.ObjectId(file._id);
                const id = file._id;
                if ((req.user.fileAuthor).includes(id) || (req.user.fileAcess).includes(id)){
                    const readStream = gridfsBucket.openDownloadStream(id);
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
        const authorIds = req.user.fileAuthor;
        const accessIds = req.user.fileAcess;
        gfs.files.find({_id:{$in:authorIds}}).toArray((err, Author) => {
            gfs.files.find({_id:{$in:accessIds}}).toArray((err, Access) => {
                res.render("workspace", { authorFiles: Author,accessFiles:Access , username : req.user.username });
            });
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
    gfs.files.update({_id:req.file.id},{$set:{Author:req.user._id}});
    res.redirect("/workspace");
});

app.post("/Access/:file",function(req,res){
    console.log(req.body,req.params);
    User.findOne({username:req.body.accessUser},function(err,doc){
        if (!err){
            if (doc){
                gfs.files.updateOne({ _id: mongoose.Types.ObjectId(req.params.file)},{$push:{Access:doc._id}},function(err){
                    if (err){
                        console.log(err);
                    }else{
                        console.log("Access Given");
                        User.updateOne({username:req.body.accessUser},{$addToSet:{fileAcess:mongoose.Types.ObjectId(req.params.file)}},function(e){
                            if (e){
                                console.log(e);
                            }else{
                                console.log("Done in user");
                            }
                        });
                    }
                });
            }else{
                console.log("Username does not exist");
            }
        }
    })
    res.redirect("/workspace");
});

app.post("/revoke/:user",function(req,res){
    User.updateOne({_id:mongoose.Types.ObjectId(req.params.user)},{$pull:{fileAcess:mongoose.Types.ObjectId(req.body.revokefile)}},function(e){
        if (!e){
            console.log("Accesss Revoked from User DB");
        }
    });
    gfs.files.updateOne({_id:mongoose.Types.ObjectId(req.body.revokefile)},{$pull:{Access:mongoose.Types.ObjectId(req.params.user)}} ,function(err){
        if(!err){
            console.log("Accesss Revoked from File DB");
        }
    });
    res.redirect("/workspace");
});

app.post("/rename/:file",function(req,res){
    if (req.isAuthenticated()) {
        gfs.files.findOne({ _id: mongoose.Types.ObjectId(req.params.file) }, function (err, file) {
            if (!err) {
                const id = mongoose.Types.ObjectId(file._id);
                if ((req.user.fileAuthor).includes(id)) {
                    const newName = req.body["rename-" + req.params.file];
                    gfs.files.updateOne({ _id: mongoose.Types.ObjectId(req.params.file) }, { $set: { filename: newName } }, function (err) {
                        if (!err) {
                            console.log("Renamed file");
                        }
                    });
                }else{
                    res.send("Not Accessable");
                }
            }
        })   
    }else{
        res.redirect("/login");
    } 
    res.redirect("/workspace");
});

app.post("/delete/:file",function(req,res){
    gridfsBucket.delete(mongoose.Types.ObjectId(req.params.file),function(err){
        if(err){
            console.log(err);
        }else{
            console.log("Deleted");
        }
    })
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


