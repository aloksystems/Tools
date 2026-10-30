(function () {
    "use strict";

    var config = window.APP_FIREBASE_CONFIG;
    var configReady = Boolean(
        config &&
        typeof config.apiKey === "string" &&
        config.apiKey.length > 0 &&
        config.apiKey.indexOf("REPLACE_WITH_NEW_RESTRICTED_API_KEY") === -1
    );

    var auth = null;
    var db = null;
    if (configReady && typeof firebase !== "undefined") {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            auth = firebase.auth();
            if (typeof firebase.firestore === "function") {
                db = firebase.firestore();
            }
        } catch (error) {
            configReady = false;
        }
    }

    var REDIRECT_DELAY = 900;
    var submitting = false;

    function isValidName(value) {
        return value.length >= 2;
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function isValidPassword(value) {
        return value.length >= 6;
    }

    document.addEventListener("DOMContentLoaded", function () {
        var form = document.getElementById("signup-form");
        if (!form) {
            return;
        }

        var nameInput = document.getElementById("username");
        var emailInput = document.getElementById("email");
        var passwordInput = document.getElementById("password");
        var submitButton = document.getElementById("signup-submit");
        var errorBox = document.getElementById("error-message");
        var statusBox = document.getElementById("status-message");
        var googleButton = document.getElementById("google-signup");
        var facebookButton = document.getElementById("facebook-signup");
        var passwordToggle = document.getElementById("toggle-password");
        var serviceNotice = document.getElementById("serviceNotice");

        if (new URLSearchParams(window.location.search).has("test")) {
            window.__gcSignup = {
                configReady: configReady,
                validateName: isValidName,
                validateEmail: isValidEmail,
                validatePassword: isValidPassword
            };
        }

        setupPasswordToggle();

        form.addEventListener("submit", handleSubmit);
        googleButton.addEventListener("click", function () {
            if (auth) {
                signUpWithProvider(new firebase.auth.GoogleAuthProvider(), "Google");
            }
        });
        facebookButton.addEventListener("click", function () {
            if (auth) {
                signUpWithProvider(new firebase.auth.FacebookAuthProvider(), "Facebook");
            }
        });
        nameInput.addEventListener("input", function () {
            clearFieldError("username");
            hideMessage(errorBox);
        });
        emailInput.addEventListener("input", function () {
            clearFieldError("email");
            hideMessage(errorBox);
        });
        passwordInput.addEventListener("input", function () {
            clearFieldError("password");
            hideMessage(errorBox);
        });

        if (!auth) {
            showServiceNotice();
            return;
        }

        auth.onAuthStateChanged(function (user) {
            if (user && !submitting) {
                window.location.replace("dashboard.html");
            }
        });

        // Detect a project where Authentication has not been set up yet.
        auth.fetchSignInMethodsForEmail("noreply@example.com").catch(function (error) {
            var code = error && error.code ? error.code : "";
            var message = String(error && error.message ? error.message : "");
            if (code === "auth/configuration-not-found" || code === "auth/invalid-api-key" ||
                code === "auth/operation-not-allowed" || message.indexOf("CONFIGURATION_NOT_FOUND") !== -1) {
                showServiceNotice();
            }
        });

        function handleSubmit(event) {
            event.preventDefault();
            hideMessage(errorBox);
            hideMessage(statusBox);

            var username = nameInput.value.trim();
            var email = emailInput.value.trim();
            var password = passwordInput.value;
            var firstInvalid = null;

            if (!isValidName(username)) {
                setFieldError("username", "Enter a name with at least 2 characters.");
                firstInvalid = firstInvalid || nameInput;
            }
            if (!isValidEmail(email)) {
                setFieldError("email", "Enter a valid email address.");
                firstInvalid = firstInvalid || emailInput;
            }
            if (!isValidPassword(password)) {
                setFieldError("password", "Use at least 6 characters.");
                firstInvalid = firstInvalid || passwordInput;
            }
            if (firstInvalid) {
                firstInvalid.focus();
                return;
            }
            if (!auth) {
                showMessage(errorBox, "Account creation is unavailable right now. Reconnect a Firebase project to continue.");
                return;
            }

            submitting = true;
            setLoading(true);
            auth.createUserWithEmailAndPassword(email, password)
                .then(function (credential) {
                    var profileUpdate = credential.user.updateProfile({ displayName: username });
                    if (!db) {
                        return profileUpdate;
                    }
                    return Promise.all([
                        profileUpdate,
                        db.collection("users").doc(credential.user.uid).set({
                            username: username,
                            email: email,
                            createdAt: new Date(),
                            photoURL: null
                        })
                    ]);
                })
                .then(function () {
                    showMessage(statusBox, "Account created. Redirecting to your dashboard…");
                    window.setTimeout(function () {
                        window.location.replace("dashboard.html");
                    }, REDIRECT_DELAY);
                })
                .catch(function (error) {
                    submitting = false;
                    setLoading(false);
                    var code = error && error.code ? error.code : "";
                    if (code === "auth/email-already-in-use") {
                        setFieldError("email", "This email is already registered. Sign in instead.");
                        emailInput.focus();
                        return;
                    }
                    if (code === "auth/weak-password") {
                        setFieldError("password", "That password is too weak. Try a longer one.");
                        passwordInput.focus();
                        return;
                    }
                    if (code === "auth/network-request-failed") {
                        showMessage(errorBox, "Network error. Check your connection and try again.");
                        return;
                    }
                    if (code.indexOf("auth/") === 0) {
                        showMessage(errorBox, signupErrorMessage(code));
                        return;
                    }
                    showMessage(errorBox, "Your account was created, but we couldn't finish setting up your profile. Try signing in.");
                });
        }

        function signUpWithProvider(provider, label) {
            hideMessage(errorBox);
            hideMessage(statusBox);
            submitting = true;
            setSocialBusy(true);
            auth.signInWithPopup(provider)
                .then(function (result) {
                    var user = result.user;
                    if (!db) {
                        return null;
                    }
                    return db.collection("users").doc(user.uid).get().then(function (doc) {
                        if (doc.exists) {
                            return null;
                        }
                        return db.collection("users").doc(user.uid).set({
                            username: user.displayName || "Member",
                            email: user.email,
                            createdAt: new Date(),
                            photoURL: user.photoURL || null
                        });
                    });
                })
                .then(function () {
                    showMessage(statusBox, "Account ready. Redirecting to your dashboard…");
                    window.setTimeout(function () {
                        window.location.replace("dashboard.html");
                    }, REDIRECT_DELAY);
                })
                .catch(function (error) {
                    submitting = false;
                    setSocialBusy(false);
                    var message = socialErrorMessage(label, error);
                    if (message) {
                        showMessage(errorBox, message);
                    }
                });
        }

        function setLoading(isLoading) {
            submitButton.disabled = isLoading;
            submitButton.textContent = isLoading ? "Creating account…" : "Create account";
            form.setAttribute("aria-busy", String(isLoading));
            setSocialBusy(isLoading);
        }

        function setSocialBusy(isBusy) {
            googleButton.disabled = isBusy;
            facebookButton.disabled = isBusy;
        }

        function setupPasswordToggle() {
            if (!passwordToggle) {
                return;
            }
            passwordToggle.addEventListener("click", function () {
                var show = passwordInput.type === "password";
                passwordInput.type = show ? "text" : "password";
                passwordToggle.setAttribute("aria-pressed", String(show));
                passwordToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
            });
        }

        function showServiceNotice() {
            if (serviceNotice) {
                serviceNotice.hidden = false;
            }
            form.querySelector("fieldset").disabled = true;
            googleButton.disabled = true;
            facebookButton.disabled = true;
        }

        function setFieldError(fieldName, message) {
            var field = form.querySelector('[data-field="' + fieldName + '"]');
            var input = document.getElementById(fieldName);
            var error = document.getElementById(fieldName + "-error");
            if (!field || !error) {
                return;
            }
            field.classList.add("has-error");
            input.setAttribute("aria-invalid", "true");
            error.textContent = message;
            error.hidden = false;
        }

        function clearFieldError(fieldName) {
            var field = form.querySelector('[data-field="' + fieldName + '"]');
            var input = document.getElementById(fieldName);
            var error = document.getElementById(fieldName + "-error");
            if (!field || !error) {
                return;
            }
            field.classList.remove("has-error");
            input.removeAttribute("aria-invalid");
            error.textContent = "";
            error.hidden = true;
        }

        function showMessage(box, message) {
            if (!box) {
                return;
            }
            box.textContent = message;
            box.hidden = false;
        }

        function hideMessage(box) {
            if (!box) {
                return;
            }
            box.textContent = "";
            box.hidden = true;
        }

        function signupErrorMessage(code) {
            switch (code) {
                case "auth/invalid-email":
                    return "That email address doesn't look right.";
                case "auth/operation-not-allowed":
                    return "Email sign-up is not enabled for this project.";
                case "auth/too-many-requests":
                    return "Too many attempts. Wait a minute and try again.";
                default:
                    return "We couldn't create your account. Please try again.";
            }
        }

        function socialErrorMessage(label, error) {
            var code = error && error.code ? error.code : "";
            if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
                return "";
            }
            switch (code) {
                case "auth/account-exists-with-different-credential":
                    return "That email already uses a different sign-in method.";
                case "auth/popup-blocked":
                    return "Your browser blocked the sign-in popup. Allow popups and try again.";
                case "auth/operation-not-allowed":
                    return label + " sign-up is not enabled for this project.";
                case "auth/network-request-failed":
                    return "Network error. Check your connection and try again.";
                default:
                    return label + " sign-up failed. Please try again.";
            }
        }
    });
})();
