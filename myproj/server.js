var express = require('express');
var bodyParser = require('body-parser');
var mysql = require('mysql2');
var path = require('path');
var connection = mysql.createConnection({
    host: '35.232.235.15',
    user: 'root',
    password: 'abc123',
    database: 'fitness_app'
});

connection.connect;


var app = express();

var session = require('express-session');

app.use(session({
    secret: 'fitnessappsecretkey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// set up ejs view engine 
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + '../public'));

app.get('/', function (req, res) {
    res.render('index', { title: 'User accounts' });
});

app.get('/login', function (req, res) {
    res.render('login');
});

app.post('/login', function (req, res) {
    var { username, password } = req.body;
    const sql = 'SELECT Name, Password FROM Users WHERE Name = ?';

    connection.query(sql, [username], function (err, result) {
        if (err) {
            res.send(err);
            return;
        }
        if (result.length > 0 && result[0].Password === password) {
            req.session.username = result[0].Name;
            res.redirect('/home');
        } else {
            res.send('Invalid username or password');
        }
    });
});

app.get('/signup', function (req, res) {
    res.render('signup', { error: null });
});

// POST to create a new user
app.post('/signup', function (req, res) {
    var name = req.body.username;
    var password = req.body.password;

    var defaultWeight = -1;
    var defaultHeight = -1;

    const sql = `INSERT INTO Users (Name, Password, Weight, Height) VALUES (?, ?, ?, ?)`;

    connection.query(sql, [name, password, defaultWeight, defaultHeight], function (err, result) {
        if (err) {
            res.render('signup', { error: err.message });
            return;
        }
        res.redirect(`/create-profile?userId=${result.insertId}`);
    });
});

app.post('/users/profile', function (req, res) {
    var userId = req.body.userId;
    var weight = parseFloat(req.body.weight);
    var height = parseFloat(req.body.height);

    if (weight <= 0 || height <= 0) {
        res.render('create-profile', { userId: userId, error: 'Weight and height must be greater than zero.' });
    } else {

        const sql = 'UPDATE Users SET Weight = ?, Height = ? WHERE User_Id = ?';

        connection.query(sql, [weight, height, userId], function (err, result) {
            if (err) {
                res.send(err);
                return;
            }
            res.redirect('/login');
        });
    }
});

app.get('/create-profile', function (req, res) {
    res.render('create-profile', { userId: req.query.userId });
});

app.get('/successlogin', function (req, res) {
    res.send({ 'message': 'Logged in!' });
});


app.get('/home', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    const today = new Date().toISOString().slice(0, 10);
    var userIdSql = 'SELECT User_Id FROM Users WHERE Name = ?';
    connection.query(userIdSql, [req.session.username], function (err, result) {
        if (err || result.length === 0) {
            res.send('Error fetching user ID.');
            return;
        }

        var userId = result[0].User_Id;

        var procedureSql = 'CALL GetDailyCalories(?, ?)';
        connection.query(procedureSql, [userId, today], function (err, results) {
            if (err) {
                res.send('Error executing stored procedure.');
                return;
            }
            var totalCalories = 0
            if (results[0][0]) {
                totalCalories = results[0][0]['Total_Calories_Consumed'];
            }
            res.render('home', {
                username: req.session.username,
                totalCalories: totalCalories
            });
        });
    });
});

app.get('/goals', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM Goals WHERE User_Id = (SELECT User_Id FROM Users WHERE Name = ?) ORDER BY Date DESC';
    connection.query(sql, [req.session.username], function (err, results) {
        if (err) {
            res.send("Error retrieving goals.");
            return;
        }
        res.render('goals', { goals: results });
    });
});

app.post('/add-goal', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    var type_of_goal = req.body.type_of_goal;
    var calories = req.body.calories;
    var weight = req.body.weight;
    var date = req.body.date;

    const sql = 'INSERT INTO Goals (User_Id, Type_of_Goal, Calories, Weight, Date) VALUES ((SELECT User_Id FROM Users WHERE Name = ?), ?, ?, ?, ?)';

    connection.query(sql, [req.session.username, type_of_goal, calories || null, weight || null, date], function (err, result) {
        if (err) {
            res.send("Error adding goal.");
            return;
        }
        res.redirect('/goals');
    });
});

app.post('/delete-goal', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const { goalId } = req.body;
    const sql = 'DELETE FROM Goals WHERE Goal_Id = ?';
    connection.query(sql, [goalId], function (err, result) {
        if (err) {
            res.send('Error deleting goal.');
            return;
        }
        res.redirect('/goals');
    });
});


app.get('/profile', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const sql = 'SELECT Weight, Height FROM Users WHERE Name = ?';
    connection.query(sql, [req.session.username], function (err, results) {
        if (err) {
            res.send('Error retrieving user profile.');
            return;
        }
        res.render('profile', {
            userId: req.session.userId,
            weight: results[0].Weight,
            height: results[0].Height
        });
    });
});

app.post('/update-profile', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const today = new Date().toISOString().slice(0, 10);
    const { weight, height } = req.body;
    const sql = 'UPDATE Users SET Weight = ?, Height = ? WHERE Name = ?';
    connection.query(sql, [weight, height, req.session.username], function (err, result) {
        if (err) {
            res.send('Error updating profile.');
            return;
        }
        const logWeightSql = 'INSERT INTO WeightLog (Weight, Date, User_Id) VALUES (?, ?, (SELECT User_Id FROM Users WHERE Name = ?))';
        connection.query(logWeightSql, [weight, today, req.session.username], function (err, logResult) {
            if (err) {
                res.send('Error logging weight update.');
                return;
            }
            res.redirect('/profile');
        });
    });
});


app.get('/progress', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const user = req.session.username;
    const weightLogsSql = `SELECT Date, WeightLog.Weight FROM WeightLog JOIN Users ON Users.User_Id = WeightLog.User_Id WHERE Users.Name = ? ORDER BY Date ASC`;
    const latestGoalSql = `SELECT Weight FROM Goals WHERE User_Id = (SELECT User_Id FROM Users WHERE Name = ?) ORDER BY Date DESC LIMIT 1`;
    connection.query(weightLogsSql, [user], function (err, weightLogs) {
        if (err) {
            res.send('Error fetching weight logs.');
            return;
        }
        connection.query(latestGoalSql, [user], function (err, goals) {
            if (err) {
                res.send('Error fetching latest weight goal.');
                return;
            }
            const targetWeight = goals.length ? goals[0].Weight : null;
            res.render('progress', {
                weightLogs: weightLogs,
                targetWeight: targetWeight
            });
        });
    });
});


app.get('/track-meals', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const today = new Date().toISOString().slice(0, 10);
    const user = req.session.username;

    let sql = `SELECT Log_Id FROM Logs WHERE User_Id = (SELECT User_Id FROM Users WHERE Name = ?) AND Date = ?`;

    connection.query(sql, [user, today], function (err, result) {
        if (err) {
            return res.send('Error accessing the database.');
        }

        if (result.length === 0) {
            sql = `INSERT INTO Logs (User_Id, Log_Type, Date) VALUES ((SELECT User_Id FROM Users WHERE Name = ?), 'Meal', ?)`;
            connection.query(sql, [user, today], function (err, result) {
                if (err) {
                    res.send('Error creating daily log.');
                    return;
                }
                renderTrackMealsPage(req, res, result.Log_Id);
            });
        } else {
            renderTrackMealsPage(req, res, result[0].Log_Id);
        }
    });
});

function renderTrackMealsPage(req, res, logId) {
    const foodSql = `SELECT Food_Id, Name FROM Food ORDER BY Name`;
    connection.query(foodSql, function (err, foods) {
        if (err) {
            res.send('Error fetching foods.');
            return;
        }

        const mealsSql = `SELECT m.Log_Id, f.Food_id, f.Name, f.Calories FROM Meals m JOIN Food f ON m.Food_Id = f.Food_Id WHERE m.Log_Id = ?`;
        connection.query(mealsSql, [logId], function (err, meals) {
            if (err) {
                res.send('Error fetching meals.');
                return;
            }
            res.render('track-meals', { meals: meals, foods: foods, logId: logId });
        });
    });
}


app.post('/add-meal', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const { logId, foodId } = req.body;

    const sql = `INSERT INTO Meals (Log_Id, Food_Id) VALUES (?, ?)`;
    connection.query(sql, [logId, foodId], function (err, result) {
        if (err) {
            res.send('Error adding meal to the log.');
            return;
        }
        res.redirect('/track-meals');
    });
});

app.post('/delete-meal', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const { logId, foodId } = req.body;
    const sql = `DELETE FROM Meals WHERE Log_Id = ? AND Food_Id = ?`;
    connection.query(sql, [logId, foodId], function (err, result) {
        if (err) {
            res.send('Error deleting meal.');
            return;
        }
        res.redirect('/track-meals');
    });
});


app.get('/track-workouts', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const today = new Date().toISOString().slice(0, 10);
    const user = req.session.username;

    let sql = `SELECT Log_Id FROM Logs WHERE User_Id = (SELECT User_Id FROM Users WHERE Name = ?) AND Date = ? AND Log_Type = 'Workout'`;
    connection.query(sql, [user, today], function (err, result) {
        if (err) {
            res.send('Error accessing the database.');
            return;
        }

        let logId = result.length ? result[0].Log_Id : null;
        if (!logId) {
            sql = `INSERT INTO Logs (User_Id, Log_Type, Date) VALUES ((SELECT User_Id FROM Users WHERE Name = ?), 'Workout', ?)`;
            connection.query(sql, [user, today], (err, result) => {
                if (err) return res.send('Error creating workout log.');
                logId = result.insertId;
                renderWorkoutsPage(req, res, logId);
            });
        } else {
            renderWorkoutsPage(req, res, logId);
        }
    });
});

function renderWorkoutsPage(req, res, logId) {
    const workoutSql = `SELECT Workout_Id, Name FROM Workouts ORDER BY Name`;
    const user = req.session.username;

    connection.query(workoutSql, function (err, workouts) {
        if (err) {
            res.send('Error fetching workouts.');
            return;
        }

        const sessionSql = `SELECT s.Log_Id, w.Workout_Id, w.Name FROM Session s JOIN Workouts w ON s.Workout_Id = w.Workout_Id WHERE s.Log_Id = ?`;
        connection.query(sessionSql, [logId], function (err, sessions) {
            if (err) {
                res.send('Error fetching workout sessions.');
                return;
            }

            const topWorkoutsSql = `CALL GetTopWorkouts((SELECT User_Id FROM Users WHERE Name = ?))`;
            connection.query(topWorkoutsSql, [user], function (err, answer) {
                if (err) {
                    res.send('Error fetching workout sessions.');
                    return;
                }
                res.render('track-workouts', { sessions: sessions, workouts: workouts, logId: logId, topWorkouts: answer[0] });
            });
        });
    });
}

app.post('/add-workout', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const { logId, workoutId } = req.body;
    const sql = `INSERT INTO Session (Log_Id, Workout_Id) VALUES (?, ?)`;
    connection.query(sql, [logId, workoutId], function (err, result) {
        if (err) {
            res.send('Error adding workout session.');
            return;
        }
        res.redirect('/track-workouts');
    });
});

app.post('/delete-workout', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const { logId, workoutId } = req.body;
    const sql = `DELETE FROM Session WHERE Log_Id = ? AND Workout_Id = ?`;
    connection.query(sql, [logId, workoutId], function (err, result) {
        if (err) {
            res.send('Error deleting workout session.');
            return;
        }
        res.redirect('/track-workouts');
    });
});

app.get('/search-food', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    res.render('search-food', { foods: [] });
});


app.post('/search-food', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const foodName = req.body.foodName;
    const sql = "CALL SearchFoodByName(?)";
    connection.query(sql, [foodName], function (err, results) {
        if (err) {
            return res.send('Error searching for food: ' + err.message);
        }
        res.render('search-food', { foods: results[0].slice(0, 5) });
    });
});

app.get('/update-username-page', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    res.render('profile-user', { username: req.session.username });
});


app.post('/update-username', function (req, res) {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const userId = req.session.username;
    const newUsername = req.body.newUsername;

    const sql = "CALL UpdateUsername((SELECT User_Id FROM Users WHERE Name = ?), ?)";
    connection.query(sql, [userId, newUsername], function (err, results) {
        if (err) {
            res.send('Error updating username.');
            return
        }
        req.session.username = newUsername;
        res.redirect('/home');
    });
});


app.listen(80, function () {
    console.log('Node app is running on port 80');
});
