const CONFIG = {
    teams: {
        hogSuckers: {
            name: "Hog Suckers",
            color: "#c0392b",
            players: {
                bodner: { name: "Nick Bodner", index: 8.5 },
                burns: { name: "Nick Burns", index: 15.5 },
                smith: { name: "Mike Smith", index: 10.7 },
                ross: { name: "Alex Ross", index: 21.0 },
                keith: { name: "Keith Hoelzer", index: 14.5 }
            }
        },
        junkyardDawgs: {
            name: "Junkyard Dawgs",
            color: "#2980b9",
            players: {
                craig: { name: "Craig Hoelzer", index: 9.6 },
                casey: { name: "Chris Casey", index: 12.8 },
                enterlin: { name: "Jake Enterlin", index: 4.6 },
                lacy: { name: "Micajah Lacy", index: 10.0 }
            }
        }
    },

    courses: {
        oldTrail: {
            name: "Old Trail",
            par: 72,
            rating: 70.1,
            slope: 133,
            pars: [5, 3, 5, 4, 4, 4, 3, 5, 3, 5, 4, 4, 3, 5, 3, 4, 4, 4],
            strokeIndex: [5, 13, 7, 11, 1, 9, 15, 3, 17, 6, 10, 14, 16, 12, 18, 2, 8, 4]
        },
        springCreek: {
            name: "Spring Creek",
            par: 72,
            rating: 71.2,
            slope: 141,
            pars: [4, 5, 4, 4, 3, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5],
            strokeIndex: [3, 9, 7, 13, 11, 1, 5, 15, 17, 4, 8, 14, 18, 2, 10, 12, 16, 6]
        },
        glenmore: {
            name: "Glenmore",
            par: 72,
            rating: 70.5,
            slope: 138,
            pars: [5, 4, 4, 3, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5],
            strokeIndex: [3, 7, 11, 1, 9, 15, 17, 5, 13, 14, 18, 6, 2, 8, 16, 12, 4, 10]
        }
    },

    days: {
        day1: {
            course: "oldTrail",
            format: "2v2 Combined Stableford",
            allowance: 1.0,
            totalPoints: 40,
            matches: [
                {
                    hs: ["bodner", "keith"],
                    jd: ["craig", "casey"],
                    points: 19
                },
                {
                    hs: ["burns", "smith"],
                    jd: ["enterlin", "lacy"],
                    points: 19
                }
            ],
            bonus: { type: "individual", points: 2 }
        },
        day2: {
            course: "springCreek",
            format: "2 Best Balls (Net + Gross)",
            allowance: 0.8,
            totalPoints: 40
        },
        day3: {
            course: "glenmore",
            format: "2v2 Best Ball + 1v1 Match Play",
            totalPoints: 60,
            front: {
                allowance: 0.9,
                matches: [
                    {
                        hs: ["bodner", "smith"],
                        jd: ["craig", "lacy"]
                    },
                    {
                        hs: ["burns", "ross"],
                        jd: ["enterlin", "casey"]
                    }
                ]
            },
            back: {
                allowance: 1.0,
                matches: [
                    { hs: "bodner", jd: "craig" },
                    { hs: "smith", jd: "lacy" },
                    { hs: "burns", jd: "enterlin" },
                    { hs: "ross", jd: "casey" }
                ]
            }
        }
    }
};

function calcCourseHandicap(index, slope, rating, par) {
    return Math.round(index * (slope / 113) + (rating - par));
}

function getPlayerCourseHcap(playerKey, courseKey, allowance) {
    const allPlayers = { ...CONFIG.teams.hogSuckers.players, ...CONFIG.teams.junkyardDawgs.players };
    const player = allPlayers[playerKey];
    const course = CONFIG.courses[courseKey];
    const raw = calcCourseHandicap(player.index, course.slope, course.rating, course.par);
    return Math.round(raw * allowance);
}

function getStrokesOnHole(courseHandicap, holeStrokeIndex) {
    if (courseHandicap <= 0) return 0;
    if (courseHandicap >= 36) return 2;
    if (holeStrokeIndex <= courseHandicap) return 1;
    if (holeStrokeIndex <= courseHandicap - 18) return 2;
    return 0;
}
