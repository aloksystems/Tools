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
    if (configReady && typeof firebase !== "undefined") {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            auth = firebase.auth();
        } catch (error) {
            configReady = false;
        }
    }

    var REDIRECT_DELAY = 900;
    var submitting = false;

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function isValidPassword(value) {
        return value.length > 0;
    }

    document.addEventListener("DOMContentLoaded", function () {
        var form = document.getElementById("login-form");
        if (!form) {
            return;
        }

        var emailInput = document.getElementById("email");
        var passwordInput = document.getElementById("password");
        var submitButton = document.getElementById("login-submit");
        var errorBox = document.getElementById("error-message");
        var statusBox = document.getElementById("status-message");
        var forgotLink = document.getElementById("forgot-password-link");
        var googleButton = document.getElementById("google-login");
        var facebookButton = document.getElementById("facebook-login");
        var passwordToggle = document.getElementById("toggle-password");
        var serviceNotice = document.getElementById("serviceNotice");

        if (new URLSearchParams(window.location.search).has("test")) {
            window.__gcAuth = {
                configReady: configReady,
                validateEmail: isValidEmail,
                validatePassword: isValidPassword
            };
        }

        setupPasswordToggle();

        form.addEventListener("submit", handleSubmit);
        forgotLink.addEventListener("click", handleForgotPassword);
        googleButton.addEventListener("click", function () {
            if (auth) {
                signInWithProvider(new firebase.auth.GoogleAuthProvider(), "Google");
            }
        });
        facebookButton.addEventListener("click", function () {
            if (auth) {
                signInWithProvider(new firebase.auth.FacebookAuthProvider(), "Facebook");
            }
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

            var email = emailInput.value.trim();
            var password = passwordInput.value;
            var firstInvalid = null;

            if (!isValidEmail(email)) {
                setFieldError("email", "Enter a valid email address.");
                firstInvalid = firstInvalid || emailInput;
            }
            if (!isValidPassword(password)) {
                setFieldError("password", "Enter your password to continue.");
                firstInvalid = firstInvalid || passwordInput;
            }
            if (firstInvalid) {
                firstInvalid.focus();
                return;
            }
            if (!auth) {
                showMessage(errorBox, "Sign-in is unavailable right now. Reconnect a Firebase project to continue.");
                return;
            }

            submitting = true;
            setLoading(true);
            auth.signInWithEmailAndPassword(email, password)
                .then(function () {
                    showMessage(statusBox, "Signed in successfully. Redirecting…");
                    window.setTimeout(function () {
                        window.location.replace("dashboard.html");
                    }, REDIRECT_DELAY);
                })
                .catch(function (error) {
                    submitting = false;
                    setLoading(false);
                    showMessage(errorBox, loginErrorMessage(error));
                });
        }

        function handleForgotPassword(event) {
            event.preventDefault();
            if (!auth) {
                return;
            }
            hideMessage(errorBox);
            hideMessage(statusBox);

            var email = emailInput.value.trim();
            if (!isValidEmail(email)) {
                setFieldError("email", "Enter your email first so we can send the reset link.");
                emailInput.focus();
                return;
            }

            forgotLink.setAttribute("aria-disabled", "true");
            auth.sendPasswordResetEmail(email)
                .then(function () {
                    showMessage(statusBox, "Password reset link sent to " + email + ". Check your inbox.");
                })
                .catch(function (error) {
                    var code = error && error.code ? error.code : "";
                    if (code === "auth/user-not-found") {
                        showMessage(errorBox, "No account found for that email address.");
                    } else if (code === "auth/network-request-failed") {
                        showMessage(errorBox, "Network error. Check your connection and try again.");
                    } else {
                        showMessage(errorBox, "We couldn't send the reset email. Please try again.");
                    }
                })
                .then(function () {
                    forgotLink.removeAttribute("aria-disabled");
                });
        }

        function signInWithProvider(provider, label) {
            hideMessage(errorBox);
            hideMessage(statusBox);
            submitting = true;
            setSocialBusy(true);
            auth.signInWithPopup(provider)
                .then(function () {
                    showMessage(statusBox, "Signed in with " + label + ". Redirecting…");
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
            submitButton.textContent = isLoading ? "Signing in…" : "Sign in";
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
            forgotLink.setAttribute("aria-disabled", "true");
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

        function loginErrorMessage(error) {
            var code = error && error.code ? error.code : "";
            switch (code) {
                case "auth/invalid-email":
                    return "That email address doesn't look right.";
                case "auth/user-disabled":
                    return "This account has been disabled.";
                case "auth/user-not-found":
                case "auth/wrong-password":
                case "auth/invalid-login-credentials":
                    return "Email or password is incorrect.";
                case "auth/too-many-requests":
                    return "Too many attempts. Wait a minute and try again.";
                case "auth/network-request-failed":
                    return "Network error. Check your connection and try again.";
                case "auth/operation-not-allowed":
                    return "Email sign-in is not enabled for this project.";
                default:
                    return "We couldn't sign you in. Please try again.";
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
                    return label + " sign-in is not enabled for this project.";
                case "auth/network-request-failed":
                    return "Network error. Check your connection and try again.";
                default:
                    return label + " sign-in failed. Please try again.";
            }
        }
    });
})();
