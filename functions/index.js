'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const {WebhookClient} = require('dialogflow-fulfillment');

// initialise DB connection
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: 'ws://petersicecreamparlor.firebaseio.com/',
});

process.env.DEBUG = 'dialogflow:debug';

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    
    // firebase
    const refOrders = '/orders';

    const agent = new WebhookClient({ request, response });
    // console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
    
    function handlePlaceOrder(agent) {

        let context = agent.getContext ('customer_order');
        console.log('==> Context ==> customer_order ==> ' + JSON.stringify(context));

        let container = context.parameters.container;
        let scoops = context.parameters.scoops;
        let flavors = context.parameters.flavors;
        
        if (scoops !== flavors.length) {
            
            agent.add('Sorry, dear customer: The number of scoops ' + 
                'and flavors does not match!');
            agent.add('Could you please start again and tell me the number ' + 
                'of scoops you want to order:');
            
            agent.setContext({ 
                name: 'awaiting_scoops', 
                lifespan: 1,
                parameters: {}
            });
            return;
        }

        // using object literal property value shorthand
        let order = {
            container,
            scoops,
            flavors,
            timeOfOrder : admin.database.ServerValue.TIMESTAMP
        };

        let database = admin.database();  // get a reference to the database service
        
        let key = '';
        return admin.database().ref('control').transaction(
            (currentData) => {
                if(currentData !== null) {
                    let latestId = currentData.latestId;
                    latestId += 1;
                    currentData.latestId = latestId;
                    
                    // add pickup name to order
                    order.pickupName = latestId;
                    console.log('==> Created unique pickup id ' + latestId);
                }
                return currentData;
            }, (error, isSuccess) => {
                if (error) { console.log('Internal error: transaction failed !'); } 
            }).then (() => { 
                return database.ref(refOrders).push();   
            }).then ((newRef) => {
                key = newRef.key;
                return newRef.set(order);
            }).then(() => {
                let reply = 'Thank you for your order! Your pickup id is ';
                agent.add(reply + order.pickupName);
                agent.add('See you soon! Bye Bye!');
                console.log('==> Added ' + key + ' to firebase list of orders!');
                return key;
            })
            .catch((err) => {
                let msg = 
                    "FirebaseClassesModule: ERROR " + err.code + 
                    ", Message: " + err.message;
                console.log('==> Firebase push failed! ' + msg);
                throw msg;
            });
    }
    
    function handleTakeScoops(agent) {

        // extract number of scoops from intent parameters
        let scoops = agent.parameters.scoops;
        if (scoops === 1) {
            agent.add('Okay, you want one scoop!');
        }
        else {
            agent.add('Okay, you want ' + scoops + ' scoops!');
        }

        agent.add('How about our delicious flavours. ' + 
            'You can choose between strawberry, vanilla and chocolate flavor. ' + 
            'Which flavours do you like?!');
        
        // using object literal property value shorthand
        let parameters = { scoops };
        
        agent.setContext({ 
            name: 'awaiting_flavors', 
            lifespan: 1, 
            parameters
        });
    }

    function handleTakeFlavors(agent) {
        
        // extract list of flavors from intent parameters
        let flavors = agent.parameters.flavors;

        // extract number of scoops from context 'awaiting_flavors' parameters
        let context = agent.getContext ('awaiting_flavors');
        console.log('==> Context ==> awaiting_flavors ==>  ' + JSON.stringify(context));
        
        let scoops = context.parameters.scoops;
        if (scoops !== flavors.length) {
            
            agent.add('Sorry, dear customer: The number of scoops and flavors ' + 
                ' does not match!');
            agent.add('Could please start again and tell me ' + 
                'the number of scoops you want');
            
            agent.setContext({ 
                name: 'awaiting_scoops', 
                lifespan: 1,
                parameters: {}
            });
        }
        else {
            
            agent.add('Well done!');
            agent.add("You've choosen " + flavors + 
                ' So finally do you prefer your ice cream in a cup or a cone?');
            
            // using object literal property value shorthand
            let parameters = {
                scoops,
                flavors
            };
        
            agent.setContext({ 
                name: 'awaiting_container',
                lifespan: 1, 
                parameters
            });
        }
    }
    
    function handleTakeContainer(agent) {

        // extract container from intent parameters
        let container = agent.parameters.container;

        // extract number of scoops and list of flavors 
        // from context 'awaiting_container' parameters
        let context = agent.getContext ('awaiting_container');
        console.log('==> Context ==> awaiting_container ==>  ' + JSON.stringify(context));
        let scoops = context.parameters.scoops;        
        let flavors = context.parameters.flavors;
        
        let spokenScoops = (scoops === 1) ? "scoop" : "scoops";

        agent.add("Fine, you've selected a " + container);
        agent.add('So let me just summarize: You like to eat ' + spokenScoops + 
            ' scoops in a ' + container + '. Your flavors are ' + flavors + 
            '. Please say Yes if this is correct, otherwise No');
            
        // using object literal property value shorthand
        let parameters = {
            container,
            scoops,
            flavors
        };
        
        agent.setContext({ 
            name: 'customer_order', 
            lifespan: 1,
            parameters
        });
        
        agent.setContext({
            name: 'awaiting_confirmation',
            lifespan: 1,
            parameters: {}
        });
    }
    
    // run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('PlaceOrder', handlePlaceOrder);
    intentMap.set('TakeScoops', handleTakeScoops);
    intentMap.set('TakeFlavors', handleTakeFlavors);
    intentMap.set('TakeContainer', handleTakeContainer);
    agent.handleRequest(intentMap);
});