const express = require('express');
const mysql = require('mysql2');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const static = require('serve-static');
const bodyParser = require('body-parser');
const dbconfig = require('./config/database.json');

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

app.post('/process/adduser', (req, res) => {
    console.log('/process/adduser 호출됨'+req);
    let paramId = req.body.id;
    let paramPassword = req.body.password;
    let paramClass = req.body.class;

    pool.getConnection((err, conn) => {
        if (err){
            conn.release();
            console.log('mysql getconnection error');
            return;
        }

        const exec = conn.query('insert into users (id, password, class) values (?, ?, ?);',
                    [paramId, paramPassword, paramClass], 
                    (err, result) => {
                        conn.release();
                        console.log('실행된 sql: '+ exec.sql);

                        if (err){
                            console.log('sql 실행 시 에러 발생함');
                            console.dir(err);
                            return;
                        }

                        if (result){
                            console.dir(result);
                            console.log('inserted 성공');
                            console.log("성공")
                            res.writeHead('200', {'Content-Type':'text/html;charset=utf8'});
                            res.write('<h2>회원가입 성공</h2>');
                            res.end();
                        }
                        else{
                            console.log('실패');
                            res.writeHead('200', {'Content-Type':'text/html;charset=utf8'});
                            res.write('<h2>회원가입 실패</h2>');
                            res.end();
                        }
                    }
        )
    });

});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'adduser.html'));
});

app.listen(3000, () => {
    console.log('server is running');
});