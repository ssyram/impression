ganizations to specify and enforce safeguards at runtime, ensuring             • The implementation of safety rules for code execution, au-
that LLM agents behave safely in diverse operational contexts.                   tonomous vehicles, and embodied agents, demonstrating risk
   To address these challenges, we introduce AgentSpec, a domain-                mitigation.
specific language (DSL) designed for the runtime enforcement of                • An experimental evaluation showing that AgentSpec pre-
LLM agent behavior. To the best of our knowledge, AgentSpec is                   vents over 90% of unsafe code executions, ensures full com-
the first framework that systematically enforces customizable safety             pliance in autonomous driving law-violation scenarios, elim-
constraints on LLM agents at runtime. AgentSpec enables the                      inates hazardous actions in embodied agent tasks, and oper-
specification of rules composed of a triggering event (e.g., an LLM              ates with millisecond-level overhead.
agent executing a financial transaction), predicate conditions (e.g.,          • An investigation of LLM-generated AgentSpec rules, demon-
whether the transaction amount exceeds a predefined threshold)                   strating their effectiveness, with OpenAI o1 (few-shot) achiev-
and enforcement (e.g., requiring user confirmation before execution              ing 95.56% precision and 70.96% recall for embodied agents,
or conducting retrospective self-examination). For example, a rule               detecting 87.26% of risky code, and preventing law-breaking
may enforce human verification before an agent modifies sensitive                in 5 out of 8 AV scenarios.
data, or enforce self-reflection [35] via an LLM before an agent
proceeds with a high-risk task. These rules can be manually defined         The remainder of this paper is organized as follows: Section 2 de-
or automatically generated for user review and approval.                 fines the problem and formalizes LLM agents. Section 3 presents the
   AgentSpec is implemented as a lightweight, modular frame-             design of AgentSpec, and Section 4 describes its implementation.
work designed to integrate seamlessly with LLM agent platforms           Section 5 reports our evaluation. Section 6 compares AgentSpec to
like LangChain [16], intercepting key execution stages to enforce        prior work, discusses its expressiveness, and limitations. Sections 7
user-defined constraints. It hooks into the agent’s decision pipeline,   covers related work before Section 8 concludes.
evaluating proposed actions against user-defined constraints prior
to their execution. Enforcement is achieved through mechanisms           2     Background and Problem Definition
such as action termination, user inspection, corrective invocation,
and self-reflection. While LangChain serves as the primary integra-      2.1     LLM Agents
tion example, AgentSpec remains framework-agnostic and can be            LLM agents [41, 43] are autonomous systems designed to achieve
adapted to other ecosystems, such as Microsoft’s AutoGen [25] and        specific objectives by perceiving their environment, reasoning about
autonomous vehicle systems like Apollo [3].                              available information, and executing actions accordingly. These
AgentSpec: Customizable Runtime Enforcement for Safe and Reliable LLM Agents                                     ICSE ’26, April 12–18, 2026, Rio de Janeiro, Brazil


agents integrate multiple components, including perception, mem-               1   rule @inspect_transfer
ory, planning, and execution, enabling them to function indepen-               2   trigger Transfer
dently in complex and dynamic environments. By interacting with                3   check
users and leveraging external tools, LLM agents facilitate decision-           4       ! is_to_family_member
making across various domains such as task automation, software                5   enforce
development, and autonomous systems.                                           6       user_inspection
   Formally, an LLM agent is a tuple (S, A, Ω, Π, ∆), where S repre-           7   end
sents the set of possible agent states, A denotes the set of actions
the agent can take, Ω represents the set of possible observations
                                                                                         Figure 2: Example rule for inspecting transactions
received as feedback from executed actions, Π : Ω → S is the per-
ception function that abstracts the state from current observation
𝜔𝑖 ∈ Ω. The LLM processes these inputs to construct the internal                   This safeguard prevents unauthorized transfers while still allowing
state 𝑠𝑖 ∈ S. Finally, the policy function ∆ : (U, S) → A maps a                   the agent to perform its intended task. Figure 2 demonstrates how
state to an action given a user instruction 𝑢. The LLM is used to                  such a rule can be specified in AgentSpec.
plan the next action 𝑎𝑖 ∈ A according to the current state 𝑠𝑖 .
   The agent interacts with its environment iteratively by receiving               2.3    Problem Definition and Goal
user instructions 𝑢 ∈ U, updating its internal state 𝑠𝑖 ∈ S, and then              The primary challenge in deploying AI agents is ensuring they
planning an action 𝑎𝑖 = ∆(𝑢, 𝑠𝑖 ), which generates an observation                  operate within safe boundaries, particularly in dynamic and uncer-
𝜔𝑖 ∈ Ω. Based on the observations, the state is updated using the                  tain environments where unexpected behaviors may arise. Due to
perception Π(𝜔𝑖 ) to get 𝑠𝑖+1 . Over time, this results in a trajectory:           their autonomy and adaptability, AI agents may deviate from user
                               𝑎0     𝑎1     𝑎𝑛−1
                      𝜏 = ⟨𝑠 0 → 𝑠 1 → . . . → 𝑠𝑛 ⟩,                               expectations, leading to actions that compromise security, privacy,
                                                                                   or system integrity.
which encapsulates the decision-making process of the agent. Here-                    To address this, our aim is to develop a framework, referred to
after, we use a slicing operation 𝜏[: −𝑖] that defines the trajectory              as AgentSpec, designed to enforce safety and reliability in LLM
excluding last 𝑖 state transitions.                                                agents. The goal of AgentSpec is to provide an expressive, rule-
   While these agents demonstrate impressive autonomy, their abil-                 based mechanism that allows users to define constraints governing
ity to take actions without direct user intervention introduces risks.             agent behavior. Unlike existing methods that rely on static poli-
Unconstrained execution may lead to unintended consequences,                       cies or post-hoc evaluations, AgentSpec enables real-time enforce-
such as data loss, privacy violations, or unsafe system modifica-                  ment based on the provided rules. The framework is built around a
tions [5, 24]. Ensuring that LLM agents operate within defined                     domain-specific language (DSL) that allows users to specify rules
