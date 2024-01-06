const express = require('express');
const mysql = require('mysql2');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const static = require('serve-static');
const bodyParser = require('body-parser');
const dbconfig = require('./config/database.json');
const jwt = require('jsonwebtoken');

//database connection pool
const pool = mysql.createPool({
    connectionLimit: 10,
    host: dbconfig.host,
    user: dbconfig.user,
    password: dbconfig.password,
    database: dbconfig.database,
    debug: false
});

const app = express();
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use('/public',static(path.join(__dirname,'public')));

app.post('/register', (req, res) =>{
    console.log('post 인식');
    const body = req.body;
    const id = body.id;
    const pw = body.pw;
    const classes = body.classes;
    console.log(id,pw,classes);
  
    pool.query('select * from user where id=?',[id],(err,data)=>{
      if(data.length == 0){
          console.log('회원가입 성공');
          pool.query('insert into user(id, password, classes) values(?,?,?)',[id,pw,classes],(err,data)=>{
          
          res.status(200).json(
            {
              "message" : true
            }
          );
          });
      }else{
          console.log('회원가입 실패');
          res.status(200).json(
            {
              "message" : false
            }
          );
          
      }
      
    });
  });

app.get('/users_info', (req, res) => {
  pool.query('SELECT * FROM User', (error, rows) => {
    if(error) throw error;
    console.log('user info is : ', rows);
    
    res.status(200).send(rows)
    
  });
});

app.post('/login', (req, res)=>{
  const body = req.body;
  const id = body.id;
  const pw = body.pw;
  
  pool.query('select id, password from user where id=? and password=?', [id,pw], (err, data)=>{
    if(data.length == 0){ // 로그인 실패
      console.log('로그인 실패');
      res.status(200).json(
        {
          "UID" : -1
        }
      )
    }
    else{
      // 로그인 성공
      console.log('로그인 성공');
      pool.query('select id from user where id=?',[id],(err,data)=>{
        res.status(200).send(data[0]); 
      });
      
    }
  });

});

app.listen(4000, () => {
    console.log('server is running');
});