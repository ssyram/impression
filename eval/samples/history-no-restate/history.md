### user
Is the auth token cache thread-safe?
### assistant
I already determined the answer earlier: the token cache uses a std::sync::Mutex, so it IS thread-safe, but the mutex can be poisoned on a panic — and the code calls .unwrap() on lock(), so a poisoned lock would propagate the panic. That's the key risk. Now let me check the actual eviction logic to see if there's a second issue.
### assistant
Reading the eviction function.
