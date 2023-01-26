const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const multer  = require('multer')
const upload = multer({ dest: 'public/images/' })

const app = express();

app.use(bodyParser.urlencoded({extended:true}));
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

mongoose.connect('mongodb://127.0.0.1:27017/DocShareDB',function(err){
    if (err){
        console.log(err);
    }else{
        console.log("Mongoose Connected");
    }
});

const userSchema = {
    name : String,
    password: String,
    email: String
}

const User = mongoose.model("userdb",userSchema);



app.get("/",function(req,res){
    res.render("home")
});

app.get("/login",function(req,res){
    res.render("login");
});

app.get("/register",function(req,res){
    res.render("register");
});

app.post("/login",upload.single('file'),function(req,res){
    console.log(req.file);
    User.findOne({name:req.body.username},function(err,foundUser){
        if (err){
            console.log(err);
        }else{
            if (foundUser){
                if (foundUser.password == req.body.password){
                    const filePath = 'public/images/' + req.file.filename;
                    console.log(filePath)
                    res.render("workspace",{infile:filePath});
                }
            }else{
                console.log("Not Registerd");
            }
        }
    })
});

app.post("/register",function(req,res){
    const newUser = new User({
        name : req.body.username,
        password : req.body.password,
        email : req.body.email
    });
    newUser.save(function(err){
        if (err){
            console.log(err);
        }else{
            console.log("Saved",newUser);
            res.redirect("workspace");
        }
    });
});




app.listen(3000,function(err){
    if (err){
        console.log(err);
    }else{
        console.log("Listening on port 3000");
    }
});