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

app.post('/login', (req, res)=>{
  const body = req.body;
  const id = body.id;
  const pw = body.pw;
  
  pool.query('select id, password from user where id=? and password=?', [id,pw], (err, data)=>{
    if(data.length == 0){ // 로그인 실패
      console.log('로그인 실패');
      res.status(200).json({token:"",id:""});
    }
    else{
      // 로그인 성공
      console.log('로그인 성공');
      pool.query('select id from user where id=?',[id],(err,data)=>{
        const token = jwt.sign({ id }, 'your_secret_key', { expiresIn: '1h' }); // 토큰 생성
        res.status(200).json({ token, id });
      });
      
    }
  });

});

function verifyToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ message: '토큰이 제공되지 않았습니다.' });
  }

  jwt.verify(token, 'your_secret_key', (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    }
    req.userId = decoded.id;
    next();
  });
}

app.post('/login/idcert', (req, res) =>{
  console.log('/login/idcert의 post 인식');
  const body = req.body;
  const id = body.id;

  pool.query('select * from user where id=?',[id],(err,data)=>{
    if(data.length == 0){
        console.log('중복 아이디 없음');
        res.status(200).json(
          {
            "isExist" : false
          }
        );
    }else{
        console.log('중복 아이디 있음');
        res.status(200).json(
          {
            "isExist" : true
          }
        );
    }
  });
});

//게시판 목록
app.get('/boardclass', (req, res) => {
  pool.query('SELECT * FROM board', (err, data) => {
      if (err) {
          res.status(500).send(err);
      } else {
          res.status(200).json(data);
      }
  });
});

app.post('/boardclass/create', (req, res) => {
  const newBoardName = req.body.newtitle;
  const creator = req.body.creater;

  // 이미 존재하는 게시판인지를 확인하는 SELECT 쿼리를 사용하지 않고, 바로 삽입 쿼리를 실행합니다.
  pool.query('INSERT INTO board (name, creater) VALUES (?, ?)', [newBoardName, creator], (err, data) => {
    if (err) {
      // 오류 발생 시, 이미 존재하는 게시판인지 확인합니다.
      console.error(err);
      if (err.code === 'ER_DUP_ENTRY') {
        console.log('이미 존재하는 게시판입니다.');
        res.status(200).json({"success": false});
      } else {
        console.log('게시판 생성 실패');
        res.status(500).json({"success":false});
      }
    } else {
      console.log('게시판 생성 성공');
      res.status(200).json({"success": true});
    }
  });
});


// 게시글 목록
app.post('/board', (req, res) => {
  const selectedBoard = req.body.name; // 클라이언트에서 선택한 게시판 이름

  pool.query('SELECT author,title,context,board FROM posts WHERE board = ?', [selectedBoard], (err, data) => {
      if (err) {
          res.status(500).send(err);
      } else {
          res.status(200).json(data);
      }
  });
});



app.listen(4000, () => {
    console.log('server is running');
});